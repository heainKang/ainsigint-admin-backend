import { db_homepage } from '../config/db_homepage.js';
import { AppDataSource_admin } from '../config/data-sources_admin.js';
import { Statistics } from '../models/statistics.entity.js';

export class StatisticsBatchService {
    constructor() {
        this.statisticsRepo = AppDataSource_admin.getRepository(Statistics);
    }

    /**
     * 📊 메인 통계 배치 실행 함수
     * 
     * 역할: 지정된 날짜의 모든 테넌트 통계를 집계하여 public.statistics 테이블에 저장
     * 
     * 처리 흐름:
     * 1. 날짜 검증 및 포맷팅
     * 2. 모든 테넌트 스키마 목록 조회 (tenant_1, tenant_2, ...)
     * 3. 각 테넌트별로 순차 처리:
     *    - 구매건수 통계 (payments_userassetshistory 기반)
     *    - 매출액 통계 (payments_payment - payments_paymentcancellation)
     *    - 이용건수 통계 (payments_userassetshistory의 사용 기록)
     *    - 통계 데이터 병합 및 저장
     * 
     * @param {string|Date|null} targetDate - 처리할 날짜 (YYYY-MM-DD 또는 Date 객체)
     *                                        null이면 전날 자동 처리
     */
    async runDailyBatch(targetDate = null) {
        let batchDate;
        
        if (targetDate) {
            // 전달받은 날짜 검증 및 포맷팅 (YYYY-MM-DD 형식)
            if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
                batchDate = targetDate;
            } else if (targetDate instanceof Date) {
                batchDate = targetDate.toISOString().split('T')[0];
            } else {
                throw new Error(`잘못된 날짜 형식입니다. YYYY-MM-DD 형식으로 입력해주세요: ${targetDate}`);
            }
        } else {
            batchDate = this.getYesterday();
        }
        
        console.log(`📊 통계 배치 시작: ${batchDate} ${targetDate ? '(수동 지정)' : '(자동 전날)'}`);
        
        const batchResult = {
            date: batchDate,
            total_tenants: 0,
            successful_tenants: 0,
            failed_tenants: 0,
            tenant_results: [],
            errors: []
        };
        
        try {

            // 1. 해당 날짜의 기존 통계 데이터 모두 삭제
            await this.deleteStatisticsByDate(batchDate);

            // 1. 모든 테넌트 스키마 목록 조회 (tenant_1, tenant_2, ...)
            const tenants = await this.getTenantList();
            batchResult.total_tenants = tenants.length;
            console.log(`발견된 테넌트 수: ${tenants.length}`);
            
            // 2. 각 테넌트별로 통계 집계 및 저장
            for (const tenant of tenants) {
                const tenantResult = await this.processTenantStatistics(tenant.schema_name, batchDate);
                batchResult.tenant_results.push(tenantResult);
                
                if (tenantResult.success) {
                    batchResult.successful_tenants++;
                } else {
                    batchResult.failed_tenants++;
                    batchResult.errors.push({
                        tenant: tenant.schema_name,
                        error: tenantResult.error
                    });
                }
            }
            
            console.log(`✅ 통계 배치 완료: ${batchDate} (성공: ${batchResult.successful_tenants}, 실패: ${batchResult.failed_tenants})`);
            return batchResult;
        } catch (error) {
            console.error('❌ 통계 배치 실행 오류:', error);
            batchResult.errors.push({
                tenant: 'GLOBAL',
                error: error.message
            });
            throw { message: error.message, details: batchResult };
        }
    }

    /**
     * 📅 월별 통계 배치 실행 함수
     * 
     * 역할: 지정된 월의 모든 날짜에 대해 일별 배치를 순차 실행
     * 
     * 처리 방식:
     * 1. 월 정보에서 해당 월의 모든 날짜 목록 생성
     * 2. 각 날짜에 대해 runDailyBatch 순차 실행
     * 3. 전체 결과를 날짜별로 집계하여 반환
     * 
     * @param {string} targetMonth - 처리할 월 (YYYY-MM 형식)
     * @returns {Object} 월별 배치 결과 객체
     */
    async runMonthlyBatch(targetMonth) {
        console.log(`📅 월별 통계 배치 시작: ${targetMonth}`);
        
        const monthlyResult = {
            month: targetMonth,
            total_days: 0,
            successful_days: 0,
            failed_days: 0,
            daily_results: [],
            total_tenants: 0,
            successful_tenants: 0,
            failed_tenants: 0,
            errors: []
        };
        
        try {
            // 1. 해당 월의 모든 날짜 목록 생성
            const dateList = this.generateDateListForMonth(targetMonth);
            monthlyResult.total_days = dateList.length;

            console.log(`📅 ${targetMonth} 월 처리 대상 날짜: ${dateList.length}일`);
            //console.log(`📅 생성된 날짜 목록:`, dateList);
            
            // 2. 각 날짜에 대해 일별 배치 실행
            for (const date of dateList) {
                try {
                    //console.log(`  📅 날짜 배치 시작: ${date}`);
                    const dailyResult = await this.runDailyBatch(date);
                    
                    monthlyResult.daily_results.push({
                        date: date,
                        success: dailyResult.failed_tenants === 0,
                        total_tenants: dailyResult.total_tenants,
                        successful_tenants: dailyResult.successful_tenants,
                        failed_tenants: dailyResult.failed_tenants,
                        errors: dailyResult.errors
                    });
                    
                    if (dailyResult.failed_tenants === 0) {
                        monthlyResult.successful_days++;
                    } else {
                        monthlyResult.failed_days++;
                        monthlyResult.errors.push(...dailyResult.errors.map(error => ({
                            ...error,
                            date: date
                        })));
                    }
                    
                    // 테넌트 누적 통계 (첫 번째 날짜의 테넌트 수를 기준으로)
                    if (monthlyResult.total_tenants === 0) {
                        monthlyResult.total_tenants = dailyResult.total_tenants;
                    }
                    monthlyResult.successful_tenants += dailyResult.successful_tenants;
                    monthlyResult.failed_tenants += dailyResult.failed_tenants;
                    
                    //console.log(`  ✅ 날짜 배치 완료: ${date} (성공: ${dailyResult.successful_tenants}, 실패: ${dailyResult.failed_tenants})`);
                    
                } catch (dayError) {
                    monthlyResult.failed_days++;
                    monthlyResult.errors.push({
                        date: date,
                        tenant: 'DAY_ERROR',
                        error: dayError.message
                    });
                    console.error(`  ❌ 날짜 배치 실패: ${date}`, dayError.message);
                }
            }
            
            console.log(`✅ 월별 통계 배치 완료: ${targetMonth} (성공: ${monthlyResult.successful_days}일, 실패: ${monthlyResult.failed_days}일)`);
            return monthlyResult;
            
        } catch (error) {
            console.error('❌ 월별 통계 배치 실행 오류:', error);
            monthlyResult.errors.push({
                date: 'MONTH_ERROR',
                tenant: 'GLOBAL',
                error: error.message
            });
            throw { message: error.message, details: monthlyResult };
        }
    }

    /**
     * 📅 월별 날짜 목록 생성 함수
     * 
     * @param {string} yearMonth - YYYY-MM 형식의 월
     * @returns {Array} 해당 월의 모든 날짜 배열 ['2025-07-01', '2025-07-02', ...]
     */
    generateDateListForMonth(yearMonth) {
        const [year, month] = yearMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate(); // 해당 월의 마지막 날
        
        const dateList = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            dateList.push(date);
        }
        
        return dateList;
    }

    /**
     * 🔍 테넌트 목록 조회 함수
     * 
     * 역할: PostgreSQL 정보 스키마에서 tenant_ 패턴의 스키마를 동적으로 발견
     * 
     * 조회 조건:
     * - schema_name이 'tenant_'로 시작
     * - 정규식 패턴 '^tenant_[0-9]+$' (tenant_숫자 형태만)
     * - 숫자 순서로 정렬 (tenant_1, tenant_2, tenant_3, ...)
     * 
     * @returns {Array} 테넌트 스키마 배열 [{schema_name: 'tenant_1'}, ...]
     */
    async getTenantList() {
        const result = await db_homepage.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name LIKE 'tenant_%'
            AND schema_name ~ '^tenant_[0-9]+$'
            ORDER BY CAST(SUBSTRING(schema_name FROM 8) AS INTEGER)
        `);
        
        //console.log(`🔍 발견된 테넌트 스키마:`, result.rows.map(r => r.schema_name));
        return result.rows;
    }

    /**
     * 📈 개별 테넌트 통계 처리 함수
     * 
     * 역할: 하나의 테넌트 스키마에 대해 모든 통계 유형을 처리
     * 
     * 처리 순서:
     * 1. 구매건수 통계 - payments_userassetshistory 테이블 기반
     * 2. 매출액 통계 - payments_payment에서 paymentcancellation 차감
     * 3. 이용건수 통계 - payments_userassetshistory의 action_type=1 기록
     * 4. 모든 통계 데이터 병합 후 public.statistics에 저장
     * 
     * 에러 처리: 개별 테넌트 오류가 전체 배치를 중단시키지 않도록 격리
     * 
     * @param {string} tenantSchema - 처리할 테넌트 스키마명 (예: 'tenant_1')
     * @param {string} batchDate - 처리할 날짜 (YYYY-MM-DD)
     */
    async processTenantStatistics(tenantSchema, batchDate) {
        //console.log(`  📈 테넌트 처리 시작: ${tenantSchema} - ${batchDate}`);
        
        const tenantResult = {
            tenant: tenantSchema,
            success: false,
            error: null,
            stats_count: 0,
            processing_time: null
        };
        
        const startTime = Date.now();
        
        try {
            // 1. 구매건수 집계 (payments_userassetshistory)
            const purchaseStats = await this.getPurchaseStatistics(tenantSchema, batchDate);
            
            // 2. 매출액 집계 (payments_payment - payments_paymentcancellation)
            const revenueStats = await this.getRevenueStatistics(tenantSchema, batchDate);
            
            // 3. 이용건수 집계 (payments_userassetshistory)
            const usageStats = await this.getUsageStatistics(tenantSchema, batchDate);
            
            // 4. 통계 데이터 병합 및 저장
            const statsCount = await this.mergeAndSaveStatistics(batchDate, {
                purchase: purchaseStats,
                revenue: revenueStats,
                usage: usageStats
            });
            
            tenantResult.success = true;
            tenantResult.stats_count = statsCount;
            tenantResult.processing_time = Math.round((Date.now() - startTime) / 10) / 100; // 초 단위 (0.01초 정밀도)

            // 테넌트 처리 완료 후 DB 재확인
            const finalVerifyCount = await this.statisticsRepo.count({
                where: { date: batchDate }
            });
            //console.log(`  ✅ 테넌트 처리 완료: ${tenantSchema} (${statsCount}건, ${tenantResult.processing_time}초)`);
            //console.log(`  🔍 처리 완료 후 최종 DB 확인 - ${batchDate} 데이터 수: ${finalVerifyCount}건`);
        } catch (error) {
            tenantResult.error = error.message;
            tenantResult.processing_time = Math.round((Date.now() - startTime) / 10) / 100; // 초 단위
            console.error(`  ❌ 테넌트 처리 오류 ${tenantSchema} (${tenantResult.processing_time}초):`, error.message);
        }
        
        return tenantResult;
    }












    
    /**
     * 🛒 구매건수 통계 집계 함수
     *
     * 역할: 지정된 날짜의 요금제 구매 및 쿠폰 지급 건수를 집계
     *
     * 집계 대상:
     * - payments_userassetshistory: 구매/지급/취소 기록 (action_type으로 구분)
     * - admin_panel_pricingplan: 요금제 정보 (service_id, type 구분)
     *
     * Action Type 기준:
     * - action_type = 0: 구매/지급 (quantity 더함)
     * - action_type = 2: 취소/차감 (quantity 뺌)
     *
     * 구분 기준:
     * - pp.type != '0': 유료 요금제 구매건수
     * - pp.type = '0': 무료 쿠폰 지급건수
     *
     * 중요: is_staff=false인 일반 사용자의 doctor_type별로 통계를 복제
     * (테넌트 전체 통계를 각 doctor_type에 동일하게 적용)
     *
     * @param {string} tenantSchema - 테넌트 스키마명
     * @param {string} batchDate - 집계 날짜 (YYYY-MM-DD)
     * @returns {Object} {purchases: [], coupons: []} 형태의 구매/쿠폰 통계
     */
    async getPurchaseStatistics(tenantSchema, batchDate) {
        // 0. 해당 테넌트의 일반사용자 doctor_type 목록 조회
        const userTypesQuery = `
            SELECT DISTINCT doctor_type
            FROM public.customers_client
            WHERE schema_name = $1 AND is_staff = false
        `;
        const userTypesResult = await db_homepage.query(userTypesQuery, [tenantSchema]);
        const userTypes = userTypesResult.rows;

        // 1. 유료 요금제 구매건수 (action_type = 0: 구매/지급)
        const purchaseQuery = `
            SELECT
                pp.service_id,
                pp.type as plan_type,
                SUM(ua.quantity) as total_purchase_quantity
            FROM "${tenantSchema}"."payments_userassetshistory" ua
            LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
            WHERE ua.action_date >= $1::date
            AND ua.action_date < ($1::date + INTERVAL '1 day')
            AND ua.action_type = 0 -- 구매/지급
            AND pp.type != '0' -- 유료 요금제만
            GROUP BY pp.service_id, pp.type
        `;

        // 2. 유료 요금제 취소건수 (action_type = 2: 취소/차감)
        const purchaseCancellationQuery = `
            SELECT
                pp.service_id,
                pp.type as plan_type,
                SUM(ua.quantity) as total_cancellation_quantity
            FROM "${tenantSchema}"."payments_userassetshistory" ua
            LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
            WHERE ua.action_date >= $1::date
            AND ua.action_date < ($1::date + INTERVAL '1 day')
            AND ua.action_type = 2 -- 취소/차감
            AND pp.type != '0' -- 유료 요금제만
            GROUP BY pp.service_id, pp.type
        `;
    
        // 3. 무료 쿠폰 지급건수 (action_type = 0: 지급)
        const couponGrantedQuery = `
            SELECT
                pp.service_id,
                pp.type as plan_type,
                SUM(ua.quantity) as total_coupon_granted_quantity
            FROM "${tenantSchema}"."payments_userassetshistory" ua
            LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
            WHERE ua.action_date >= $1::date
            AND ua.action_date < ($1::date + INTERVAL '1 day')
            AND ua.action_type = 0 -- 지급
            AND pp.type = '0' -- 무료 쿠폰만
            GROUP BY pp.service_id, pp.type
        `;

        // 4. 무료 쿠폰 차감건수 (action_type = 2: 차감)
        const couponDeductionQuery = `
            SELECT
                pp.service_id,
                pp.type as plan_type,
                SUM(ua.quantity) as total_coupon_deduction_quantity
            FROM "${tenantSchema}"."payments_userassetshistory" ua
            LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
            WHERE ua.action_date >= $1::date
            AND ua.action_date < ($1::date + INTERVAL '1 day')
            AND ua.action_type = 2 -- 차감
            AND pp.type = '0' -- 무료 쿠폰만
            GROUP BY pp.service_id, pp.type
        `;

        // 쿼리 실행
        const purchaseResult = await db_homepage.query(purchaseQuery, [batchDate]);
        const purchaseCancellationResult = await db_homepage.query(purchaseCancellationQuery, [batchDate]);
        const couponGrantedResult = await db_homepage.query(couponGrantedQuery, [batchDate]);
        const couponDeductionResult = await db_homepage.query(couponDeductionQuery, [batchDate]);

        // 각 doctor_type에 대해 동일한 통계값 복제
        const allResults = { purchases: [], coupons: [] };

        for (const userType of userTypes) {
            // 구매 통계 결합 (구매 - 취소)
            const purchaseMap = new Map();

            // 구매 데이터 추가
            purchaseResult.rows.forEach(row => {
                const key = `${row.service_id}_${row.plan_type}`;
                purchaseMap.set(key, {
                    service_id: row.service_id,
                    plan_type: row.plan_type,
                    purchase_count: parseInt(row.total_purchase_quantity || 0),
                    user_type: userType.doctor_type
                });
            });

            // 취소 데이터 차감
            purchaseCancellationResult.rows.forEach(row => {
                const key = `${row.service_id}_${row.plan_type}`;
                if (purchaseMap.has(key)) {
                    purchaseMap.get(key).purchase_count -= parseInt(row.total_cancellation_quantity || 0);
                } else {
                    purchaseMap.set(key, {
                        service_id: row.service_id,
                        plan_type: row.plan_type,
                        purchase_count: -parseInt(row.total_cancellation_quantity || 0),
                        user_type: userType.doctor_type
                    });
                }
            });

            // 쿠폰 통계 결합 (지급 - 차감)
            const couponMap = new Map();

            // 쿠폰 지급 데이터 추가
            couponGrantedResult.rows.forEach(row => {
                const key = `${row.service_id}_${row.plan_type}`;
                couponMap.set(key, {
                    service_id: row.service_id,
                    plan_type: row.plan_type,
                    coupon_granted_count: parseInt(row.total_coupon_granted_quantity || 0),
                    user_type: userType.doctor_type
                });
            });

            // 쿠폰 차감 데이터 차감
            couponDeductionResult.rows.forEach(row => {
                const key = `${row.service_id}_${row.plan_type}`;
                if (couponMap.has(key)) {
                    couponMap.get(key).coupon_granted_count -= parseInt(row.total_coupon_deduction_quantity || 0);
                } else {
                    couponMap.set(key, {
                        service_id: row.service_id,
                        plan_type: row.plan_type,
                        coupon_granted_count: -parseInt(row.total_coupon_deduction_quantity || 0),
                        user_type: userType.doctor_type
                    });
                }
            });

            allResults.purchases.push(...Array.from(purchaseMap.values()));
            allResults.coupons.push(...Array.from(couponMap.values()));
        }

        //console.log(`[${tenantSchema}] 최종 결과 - 구매: ${allResults.purchases.length}건, 쿠폰: ${allResults.coupons.length}건`);

        return {
            purchases: allResults.purchases,
            coupons: allResults.coupons
        };
    }

    /**
     * 💰 매출액 통계 집계 함수
     * 
     * 역할: 지정된 날짜의 실제 매출액을 계산 (결제액 - 취소액)
     * 
     * 집계 대상:
     * - payments_payment: 결제 데이터 (total_price 합계)
     * - payments_paymentcancellation: 취소 데이터 (refund_amount 합계)
     * - admin_panel_pricingplan: 요금제 정보
     * 
     * 집계 조건:
     * - 결제: created_at 기준, pay_status_id='0' (승인완료)
     * - 취소: ended_at 기준, cancel_status='1' (전체환불)
     * - 유료 요금제만: pp.type != '0' (쿠폰/무료 제외)
     * 
     * 계산 공식: 총 매출액 = SUM(결제액) - SUM(환불액)
     * 
     * 중요: is_staff=false인 일반 사용자의 doctor_type별로 통계를 복제
     * 
     * @param {string} tenantSchema - 테넌트 스키마명
     * @param {string} batchDate - 집계 날짜 (YYYY-MM-DD)
     * @returns {Object} {payments: [], cancellations: []} 형태의 매출/취소 통계
     */
    async getRevenueStatistics(tenantSchema, batchDate) {
        // 0. 해당 테넌트의 일반사용자 doctor_type 목록 조회
        const userTypesQuery = `
            SELECT DISTINCT doctor_type
            FROM public.customers_client 
            WHERE schema_name = $1 AND is_staff = false
        `;
        const userTypesResult = await db_homepage.query(userTypesQuery, [tenantSchema]);
        const userTypes = userTypesResult.rows;
        
        // 1. 테넌트 전체 결제 데이터 (action_type = 0: 결제완료/지급)
        const paymentQuery = `
            SELECT
                pp.service_id,
                pp.type as plan_type,
                SUM(ua.total_price) as total_payment
            FROM "${tenantSchema}"."payments_userassetshistory" ua
            LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
            WHERE ua.action_date >= $1::date
            AND ua.action_date < ($1::date + INTERVAL '1 day')
            AND ua.action_type = 0 -- 결제완료/지급
            AND pp.type != '0' -- 유료 요금제만
            GROUP BY pp.service_id, pp.type
        `;

        // 2. 테넌트 전체 취소 데이터 (action_type = 2: 취소/차감)
        const cancellationQuery = `
            SELECT
                pp.service_id,
                pp.type as plan_type,
                SUM(ua.total_price) as total_cancellation
            FROM "${tenantSchema}"."payments_userassetshistory" ua
            LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
            WHERE ua.action_date >= $1::date
            AND ua.action_date < ($1::date + INTERVAL '1 day')
            AND ua.action_type = 2 -- 취소/차감
            AND pp.type != '0' -- 유료 요금제만
            GROUP BY pp.service_id, pp.type
        `;
        
        // 쿼리 실행
        const paymentResult = await db_homepage.query(paymentQuery, [batchDate]);
        const cancellationResult = await db_homepage.query(cancellationQuery, [batchDate]);

        // 디버깅용 로그 추가
        /*
            console.log(`🔍 [배치] [${tenantSchema}] ${batchDate} 매출액 계산:`);
            console.log(`  💰 결제 데이터:`, paymentResult.rows);
            console.log(`  💸 취소 데이터:`, cancellationResult.rows);
            console.log(`  📋 결제 쿼리:`, paymentQuery.replace(/\$1/g, `'${batchDate}'`));
            console.log(`  📋 취소 쿼리:`, cancellationQuery.replace(/\$1/g, `'${batchDate}'`));

            // 총합 계산
            const totalPayment = paymentResult.rows.reduce((sum, row) => sum + parseFloat(row.total_payment || 0), 0);
            const totalCancellation = cancellationResult.rows.reduce((sum, row) => sum + parseFloat(row.total_cancellation || 0), 0);
            console.log(`  💰 총 결제액: ${totalPayment}원`);
            console.log(`  💸 총 취소액: ${totalCancellation}원`);
            console.log(`  📊 순매출: ${totalPayment - totalCancellation}원`);
        */
        // 각 doctor_type에 대해 동일한 통계값 복제
        const allResults = { payments: [], cancellations: [] };
        
        for (const userType of userTypes) {
            // 결제 통계에 user_type 추가
            const paymentsWithUserType = paymentResult.rows.map(row => ({
                ...row,
                user_type: userType.doctor_type
            }));
            
            // 취소 통계에 user_type 추가
            const cancellationsWithUserType = cancellationResult.rows.map(row => ({
                ...row,
                user_type: userType.doctor_type
            }));
            
            allResults.payments.push(...paymentsWithUserType);
            allResults.cancellations.push(...cancellationsWithUserType);
        }
        
        return { payments: allResults.payments, cancellations: allResults.cancellations };
    }

    /**
     * 📊 이용건수 통계 집계 함수
     * 
     * 역할: 지정된 날짜의 실제 서비스 이용 건수를 집계
     * 
     * 집계 대상:
     * - payments_userassetshistory: 자산 이용 기록
     * - admin_panel_pricingplan: 요금제 정보
     * 
     * 집계 조건:
     * - action_date 기준 (해당 날짜)
     * - action_type = 1 (차감/사용 기록만, 0은 지급)
     * - 모든 요금제 유형 포함 (유료/무료 구분 없음)
     * 
     * 이용 유형:
     * - pp.type = '0': 쿠폰 사용
     * - pp.type != '0': 1회 이용권 사용
     * 
     * 중요: is_staff=false인 일반 사용자의 doctor_type별로 통계를 복제
     * 
     * @param {string} tenantSchema - 테넌트 스키마명
     * @param {string} batchDate - 집계 날짜 (YYYY-MM-DD)
     * @returns {Array} 이용건수 통계 배열
     */
    async getUsageStatistics(tenantSchema, batchDate) {
        // 0. 해당 테넌트의 일반사용자 doctor_type 목록 조회
        const userTypesQuery = `
            SELECT DISTINCT doctor_type
            FROM public.customers_client 
            WHERE schema_name = $1 AND is_staff = false
        `;
        const userTypesResult = await db_homepage.query(userTypesQuery, [tenantSchema]);
        const userTypes = userTypesResult.rows;
        
        // 1. 테넌트 전체 이용건수 통계
        const usageQuery = `
            SELECT 
                pp.service_id,
                pp.type as plan_type,
                COUNT(*) as usage_count
            FROM "${tenantSchema}"."payments_userassetshistory" uah
            LEFT JOIN public.admin_panel_pricingplan pp ON uah.pricing_plan_id = pp.id
            WHERE uah.action_date >= $1::date 
            AND uah.action_date < ($1::date + INTERVAL '1 day')
            AND uah.action_type = 1
            GROUP BY pp.service_id, pp.type
        `;
                
        //console.log(`[${tenantSchema}] 이용 쿼리 실행 - 날짜: ${batchDate}`);
        //console.log(`[${tenantSchema}] 이용 쿼리:`, usageQuery.replace(/\$1/g, `'${batchDate}'`));
        
        // 쿼리 실행
        const usageResult = await db_homepage.query(usageQuery, [batchDate]);
        
        //console.log(`[${tenantSchema}] 이용 통계 결과:`, usageResult.rows.length, '건');
        //if (usageResult.rows.length > 0) {
        //    console.log(`[${tenantSchema}] 이용 데이터 샘플:`, usageResult.rows[0]);
        //}

        // 각 doctor_type에 대해 동일한 통계값 복제
        const allResults = [];
        
        for (const userType of userTypes) {
            // 이용건수 통계에 user_type 추가
            const usageWithUserType = usageResult.rows.map(row => ({
                ...row,
                user_type: userType.doctor_type
            }));
            
            allResults.push(...usageWithUserType);
        }
        
        return allResults;
    }

    /**
     * 🔄 통계 데이터 병합 및 저장 함수
     *
     * 역할: 구매/매출/이용 통계를 service_id + type + user_type 단위로 병합 후 저장
     *
     * 병합 기준: `${service_id}_${plan_type}_${user_type}` 키로 그룹화
     *
     * 통계 컬럼 매핑:
     * - total_sales_count: 구매건수 (쿠폰 제외)
     * - total_granted_count: 쿠폰 지급건수
     * - total_sales_price: 순 매출액 (결제액 - 환불액)
     * - total_onetime_use_count: 1회 이용권 사용건수
     * - total_coupon_use_count: 쿠폰 사용건수
     *
     * 저장 방식: DELETE & INSERT (해당 날짜의 모든 데이터 삭제 후 새로 생성)
     *
     * @param {string} batchDate - 집계 날짜
     * @param {Object} stats - {purchase: {}, revenue: {}, usage: []} 형태의 통계 데이터
     */
    async mergeAndSaveStatistics(batchDate, stats) {
        //console.log(`[MERGE] 배치 시작 - 구매: ${stats.purchase.purchases.length}건, 쿠폰: ${stats.purchase.coupons.length}건, 이용: ${stats.usage.length}건`);
        //console.log(`[MERGE] 매출 데이터 - 결제: ${stats.revenue.payments.length}건, 취소: ${stats.revenue.cancellations.length}건`);
        const mergedStats = new Map();
        
        // 실제 구매 통계 처리 (쿠폰 제외)
        for (const item of stats.purchase.purchases) {
            //  const key = `${item.service_id}_${item.plan_type}_${item.user_type}`;
            const key = `${item.service_id}_${item.plan_type}_${item.user_type}`;
            if (!mergedStats.has(key)) {
                mergedStats.set(key, {
                    date: batchDate,
                    service_id: item.service_id,
                    type: item.plan_type, // pricing_plan.type 사용
                    user_type: item.user_type,
                    total_sales_count: 0,
                    total_sales_price: 0,
                    total_granted_count: 0,
                    total_onetime_use_count: 0,
                    total_coupon_use_count: 0
                });
            }
            
            const stat = mergedStats.get(key);
            stat.total_sales_count += parseInt(item.purchase_count) || 0;
        }

        // 쿠폰 지급 통계 처리
        //console.log(`[MERGE] 쿠폰 지급 처리 시작: ${stats.purchase.coupons.length}건`);
        for (const item of stats.purchase.coupons) {
            const key = `${item.service_id}_${item.plan_type}_${item.user_type}`;
            if (!mergedStats.has(key)) {
                mergedStats.set(key, {
                    date: batchDate,
                    service_id: item.service_id,
                    type: item.plan_type, // pricing_plan.type 사용
                    user_type: item.user_type,
                    total_sales_count: 0,
                    total_sales_price: 0,   //판매건 있어도 쿠폰있으면 같이 0 되는거 아닌가 확인바람!!! 
                    total_granted_count: 0,
                    total_onetime_use_count: 0,
                    total_coupon_use_count: 0
                });
            }
            
            const stat = mergedStats.get(key);
            const grantedCount = parseInt(item.coupon_granted_count) || 0;
            stat.total_granted_count += grantedCount;
           // console.log(`[COUPON] ${key}: +${grantedCount} = ${stat.total_granted_count}`);
           // console.log(`[COUPON] item:`, item);
        }
        
        // 매출 통계 처리
        for (const item of stats.revenue.payments) {
            const key = `${item.service_id}_${item.plan_type}_${item.user_type}`;
            if (!mergedStats.has(key)) {
                mergedStats.set(key, {
                    date: batchDate,
                    service_id: item.service_id,
                    type: item.plan_type,
                    user_type: item.user_type,
                    total_sales_count: 0,
                    total_sales_price: 0,
                    total_granted_count: 0,
                    total_onetime_use_count: 0,
                    total_coupon_use_count: 0
                });
            }
            mergedStats.get(key).total_sales_price += parseFloat(item.total_payment) || 0;
        }
        
        // 취소 통계 처리
        for (const item of stats.revenue.cancellations) {
            const key = `${item.service_id}_${item.plan_type}_${item.user_type}`;
            if (mergedStats.has(key)) {
                const beforePrice = mergedStats.get(key).total_sales_price;
                const cancellationAmount = parseFloat(item.total_cancellation) || 0;
                mergedStats.get(key).total_sales_price -= cancellationAmount;
            }
        }
        
        // 이용 통계 처리
        for (const item of stats.usage) {
            const key = `${item.service_id}_${item.plan_type}_${item.user_type}`;
            if (!mergedStats.has(key)) {
                mergedStats.set(key, {
                    date: batchDate,
                    service_id: item.service_id,
                    type: item.plan_type,
                    user_type: item.user_type,
                    total_sales_count: 0,
                    total_sales_price: 0,
                    total_granted_count: 0,
                    total_onetime_use_count: 0,
                    total_coupon_use_count: 0
                });
            }
            
            const stat = mergedStats.get(key);
            // plan_type을 기준으로 구분 (pp.type)
            if (item.plan_type === '0') { // 쿠폰 (pp.type = '0')
                stat.total_coupon_use_count += parseInt(item.usage_count) || 0;
            } else { // 1회 이용권 (pp.type != '0')
                stat.total_onetime_use_count += parseInt(item.usage_count) || 0;
            }
            
            //console.log(`[USAGE] ${item.service_id} - ${item.plan_type}: ${item.usage_count}건 추가`);
        }
        
        // 2. 병합 결과 확인
       //console.log(`[MERGE] 병합 완료 - 총 ${mergedStats.size}개 키 생성`);
        if (mergedStats.size > 0) {
            const firstKey = Array.from(mergedStats.keys())[0];
            //console.log(`[MERGE] 첫 번째 키 샘플: ${firstKey}`);
            //console.log(`[MERGE] 첫 번째 데이터 샘플:`, JSON.stringify(mergedStats.get(firstKey), null, 2));
        }

        // 3. 새로운 통계 데이터 일괄 저장
        const statsArray = Array.from(mergedStats.values());
        await this.bulkInsertStatistics(statsArray);

       //console.log(`     저장된 통계 레코드 수: 💾  ${mergedStats.size}`);
        return mergedStats.size;
    }

    /**
     * 🗑️ 해당 날짜의 모든 통계 데이터 삭제 함수
     *
     * 역할: 배치 처리 전에 해당 날짜의 기존 통계 데이터를 모두 삭제
     *
     * @param {string} date - 삭제할 날짜 (YYYY-MM-DD)
     */
    async deleteStatisticsByDate(date) {
        try {
            //console.log(`🗑️ [삭제 시작] 대상 날짜: ${date} (타입: ${typeof date})`);

            // 삭제 전에 해당 날짜의 기존 데이터 수 확인
            const beforeCount = await this.statisticsRepo
                .createQueryBuilder()
                .where('date = :date', { date: date })
                .getCount();

            //console.log(`🗑️ [${date}] 삭제 전 데이터 수: ${beforeCount}건`);

            // 정확한 날짜 매칭을 위해 createQueryBuilder 사용
            const deleteResult = await this.statisticsRepo
                .createQueryBuilder()
                .delete()
                .where('date = :date', { date: date })
                .execute();

            //console.log(`🗑️ [${date}] 기존 통계 데이터 삭제: ${deleteResult.affected}건`);

            // 디버깅: 삭제 후 해당 날짜의 남은 데이터 확인
            const remainingCount = await this.statisticsRepo
                .createQueryBuilder()
                .where('date = :date', { date: date })
                .getCount();

            //if (remainingCount > 0) {
            //    console.log(`⚠️ [${date}] 삭제 후에도 남은 데이터: ${remainingCount}건`);
            //}
        } catch (error) {
            console.error(`날짜별 통계 삭제 오류 (${date}):`, error);
            throw error;
        }
    }

    /**
     * 💾 통계 데이터 일괄 저장 함수
     *
     * 역할: 병합된 통계 데이터를 한 번에 저장
     *
     * @param {Array} statsArray - 저장할 통계 데이터 배열
     */
    async bulkInsertStatistics(statsArray) {
        try {
            if (statsArray.length > 0) {
                await this.statisticsRepo.save(statsArray);
                //console.log(`💾 새로운 통계 데이터 저장 완료: ${statsArray.length}건`);
            } else {
                //console.log(`⚠️ 저장할 데이터가 없습니다.`);
            }
        } catch (error) {
            console.error('💥 통계 일괄 저장 오류:', error);
            throw error;
        }
    }

    getToday() {
        const today = new Date();
        return today.toLocaleDateString('sv-SE', {timeZone: 'Asia/Seoul'});
    }
    
    getYesterday() {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return yesterday.toLocaleDateString('sv-SE', {timeZone: 'Asia/Seoul'});
    }

    /**
     * 🔍 배치 완료 여부 확인 함수
     * 
     * 역할: 지정된 날짜의 통계 데이터가 public.statistics 테이블에 존재하는지 확인
     * 
     * 확인 방법:
     * - public.statistics 테이블에서 해당 날짜의 레코드가 1건 이상 있는지 확인
     * - 날짜는 date 컬럼을 기준으로 검색
     * 
     * @param {string} date - 확인할 날짜 (YYYY-MM-DD 형식)
     * @returns {boolean} 해당 날짜의 데이터가 존재하면 true, 없으면 false
     */
    async checkBatchCompleted(date) {
        try {
            const result = await this.statisticsRepo.count({
                where: {
                    date: date
                }
            });
            
            const hasData = result > 0;
            //console.log(`🔍 배치 완료 확인: ${date} - ${hasData ? '완료' : '미완료'} (${result}건)`);
            return hasData;
        } catch (error) {
            console.error(`배치 완료 확인 오류: ${date}`, error);
            return false;
        }
    }
}

/*
 값 있는데 안들어가면 확인해볼 것!
  1. userTypes가 비어있음: is_staff=false인 사용자가 없어서 복제 과정에서 데이터가 사라짐
  2. 데이터 형식 문제: coupon_granted_count 값이 예상과 다름
  3. 키 생성 문제: service_id, plan_type, user_type 조합에서 null 값

  입증 : staff 아니여야하고. 
*/