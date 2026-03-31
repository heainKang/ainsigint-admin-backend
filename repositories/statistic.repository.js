import { AppDataSource_admin } from '../config/data-sources_admin.js';
import { Statistics } from '../models/statistics.entity.js';
import { db_homepage } from '../config/db_homepage.js';

// 당일 매출액 실시간 계산 (배치 로직과 동일)
async function calculateTodayRevenue(date) {
    try {
        // 1. 모든 테넌트 목록 조회
        const tenantsResult = await db_homepage.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name LIKE 'tenant_%'
            AND schema_name ~ '^tenant_[0-9]+$'
            ORDER BY CAST(SUBSTRING(schema_name FROM 8) AS INTEGER)
        `);
        
        let totalRevenue = 0;
        
        // 2. 각 테넌트별로 매출액 계산
        for (const tenant of tenantsResult.rows) {
            const tenantSchema = tenant.schema_name;
            
            try {
                // 결제 데이터 (action_type = 0: 결제완료/지급)
                const paymentQuery = `
                    SELECT SUM(ua.total_price) as total_payment
                    FROM "${tenantSchema}"."payments_userassetshistory" ua
                    LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
                    WHERE ua.action_date >= $1::date
                    AND ua.action_date < ($1::date + INTERVAL '1 day')
                    AND ua.action_type = 0 -- 결제완료/지급
                    AND pp.type != '0' -- 유료 요금제만
                    AND pp.service_id IS NOT NULL
                `;

                // 취소 데이터 (action_type = 2: 취소/차감)
                const cancellationQuery = `
                    SELECT SUM(ua.total_price) as total_cancellation
                    FROM "${tenantSchema}"."payments_userassetshistory" ua
                    LEFT JOIN public.admin_panel_pricingplan pp ON ua.pricing_plan_id = pp.id
                    WHERE ua.action_date >= $1::date
                    AND ua.action_date < ($1::date + INTERVAL '1 day')
                    AND ua.action_type = 2 -- 취소/차감
                    AND pp.type != '0' -- 유료 요금제만
                    AND pp.service_id IS NOT NULL
                `;
                
                const [paymentResult, cancellationResult] = await Promise.all([
                    db_homepage.query(paymentQuery, [date]),
                    db_homepage.query(cancellationQuery, [date])
                ]);
                
                const payments = parseFloat(paymentResult.rows[0]?.total_payment || 0);
                const cancellations = parseFloat(cancellationResult.rows[0]?.total_cancellation || 0);
                
                // 순 매출액 = 결제액 - 환불액
                totalRevenue += (payments - cancellations);
                
            } catch (tenantError) {
                console.log(`⚠️  ${tenantSchema} 매출액 계산 오류:`, tenantError.message);
                // 개별 테넌트 오류는 무시하고 계속
            }
        }
        
        return { total_revenue: totalRevenue };
        
    } catch (error) {
        console.error('당일 매출액 계산 오류:', error);
        return { total_revenue: 0 };
    }
}

// 1. 일별현황 (날짜별 총 매출액 + 회원 통계)
export async function getDailyStatusData(date) {
    try {
        const statisticsRepo = AppDataSource_admin.getRepository(Statistics);
        
        // 1. 해당 날짜의 총 매출액 집계
        let revenueResult;
        const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Seoul'}); // 한국 시간 기준 오늘 날짜 YYYY-MM-DD
        
        if (date === today) {
            // 당일 데이터는 실시간 계산 (배치 방식과 동일)
            revenueResult = await calculateTodayRevenue(date);
        } else {
            // 전날 데이터는 배치된 통계에서 가져오기
            const batchedResult = await statisticsRepo
                .createQueryBuilder('stats')
                .select('SUM(stats.total_sales_price)', 'total_revenue')
                .where('stats.date = :date', { date })
                .getRawOne();
            revenueResult = { total_revenue: batchedResult?.total_revenue || 0 };
        }
        
        // 2. 신규 가입자 수 (해당 날짜 가입)
        const newUsersQuery = `
            SELECT COUNT(*) as new_users
            FROM public.customers_client 
            WHERE DATE(created_at) = $1
        `;
        
        // 3. 총 회원 수 (해당 날짜까지의 누적)
        const totalUsersQuery = `
            SELECT COUNT(*) as total_users
            FROM public.customers_client 
            WHERE DATE(created_at) <= $1
        `;
        
        // 4. 국내/외국인 회원 수 (해당 날짜까지의 누적)
        const domesticForeignQuery = `
            SELECT 
                COUNT(CASE WHEN country_id = 31 THEN 1 END) as domestic,
                COUNT(CASE WHEN country_id != 31 THEN 1 END) as foreign
            FROM public.customers_client 
            WHERE DATE(created_at) <= $1
        `;
        
        // 병렬로 쿼리 실행
        const [newUsersResult, totalUsersResult, domesticForeignResult] = await Promise.all([
            db_homepage.query(newUsersQuery, [date]),
            db_homepage.query(totalUsersQuery, [date]),
            db_homepage.query(domesticForeignQuery, [date])
        ]);
        
        return {
            date: date,
            total_all_price: parseFloat(revenueResult?.total_revenue || 0),
            new_users: parseInt(newUsersResult.rows[0]?.new_users || 0),
            total_users: parseInt(totalUsersResult.rows[0]?.total_users || 0),
            domestic: parseInt(domesticForeignResult.rows[0]?.domestic || 0),
            foreign: parseInt(domesticForeignResult.rows[0]?.foreign || 0)
        };
    } catch (error) {
        throw new Error('일별현황 데이터 조회 오류: ' + error.message);
    }
}
// 2. 미처리 현황
export async function getUnresolvedData() {
    try {
        // 1. 모든 테넌트 목록 조회
        const tenantResult = await db_homepage.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name LIKE 'tenant_%'
            AND schema_name ~ '^tenant_[0-9]+$'
            ORDER BY CAST(SUBSTRING(schema_name FROM 8) AS INTEGER)
        `);
        
        //console.log(`🔍 발견된 테넌트 스키마:`, tenantResult.rows.map(r => r.schema_name));
        
        let unansweredTotal = 0;
        let pendingCancellationTotal = 0;
        const details = [];
        
        // 2. 각 테넌트별로 미처리 현황 집계
        for (const tenant of tenantResult.rows) {
            const tenantSchema = tenant.schema_name;
            
            try {
                // 답변대기: questions_userquestion 테이블에서 status_id = 0
                const unansweredQuery = `
                    SELECT COUNT(*) as count
                    FROM "${tenantSchema}"."questions_userquestion"
                    WHERE status_id = 0
                `;
                
                // 취소요청: payments_paymentcancellation에서 cancel_status = 0 
                const pendingCancellationQuery = `
                    SELECT COUNT(*) as count
                    FROM "${tenantSchema}"."payments_paymentcancellation"
                    WHERE cancel_status = 0
                `;
                
                const [unansweredResult, pendingResult] = await Promise.all([
                    db_homepage.query(unansweredQuery),
                    db_homepage.query(pendingCancellationQuery)
                ]);
                
                const unansweredCount = parseInt(unansweredResult.rows[0]?.count || 0);
                const pendingCount = parseInt(pendingResult.rows[0]?.count || 0);
                
                unansweredTotal += unansweredCount;
                pendingCancellationTotal += pendingCount;
                
                // 개별 테넌트 상세 정보 (0이 아닌 경우만)!!! 상세 요청건 탤런트 알려주기(표기는안함.)
                if (unansweredCount > 0 || pendingCount > 0) {
                    details.push({
                        tenant: tenantSchema,
                        unanswered: unansweredCount,
                        pending_cancellation: pendingCount
                    });
                }
                
            } catch (tenantError) {
                console.log(`⚠️  ${tenantSchema} 스키마에서 오류 (테이블이 없을 수 있음):`, tenantError.message);
                // 개별 테넌트 오류는 무시하고 계속 진행
            }
        }
        
        return {
            total_unanswered: unansweredTotal,
            total_pending_cancellation: pendingCancellationTotal
            // ,details: details
        };
        
    } catch (error) {
        console.error('미처리 현황 조회 오류:', error);
        return {
            //에러나면 무시하고 0 표시하는걸로. (다른것도 안보이면 안될 것 같아서.)
            summary: {
                total_unanswered: 0, //에러니까 0 
                total_pending_cancellation: 0
            }
            ,details :[]
        };
    }
}

// 3. 서비스유형 조회
export async function getServicesData() {
    try {
        // admin_panel_servicedefinition에서 서비스 목록 조회
        const servicesQuery = `
            SELECT id, name
            FROM public.admin_panel_servicedefinition
            ORDER BY id ASC
        `;
        
        const servicesResult = await db_homepage.query(servicesQuery);
        
        // 서비스 유형 (순번으로 id 부여)
        const services = [
            ...servicesResult.rows.map(service => ({
                id: service.id,
                name: service.name
            }))
        ];
        
        // 회원권유형
        const user_type = [
            { id: "0", name: "일반의" },
            { id: "1", name: "교정의" },
            { id: "2", name: "기타" }
        ];

        // 서비스유형
        const types = [
            { id: "0", name: "쿠폰" },
            { id: "1", name: "1회 이용권" },
            { id: "2", name: "1년이용권" }
        ];

        return {
            service_types: services,
            user_types : user_type,
            types : types
        };
        
    } catch (error) {
        throw new Error('서비스유형 데이터 조회 오류: ' + error.message);
    }
}

export async function getDashboardData(params) {
    const { date, period, service_id, type, user_type } = params;
    
    try {
        const statisticsRepo = AppDataSource_admin.getRepository(Statistics);
        
        // 날짜 범위 계산
        let dateCondition;
        if (period === 'daily') {
            // 일별: 해당 날짜만 (2025-08-20)
            dateCondition = 'stats.date = :date';
        } else if (period === 'month') {
            // 월별: 해당 월의 모든 날짜
            if (date.includes('-') && date.split('-').length === 3) {
                // 2025-09-04 형태인 경우 -> 2025-09 추출
                const monthStr = date.substring(0, 7);
                dateCondition = `stats.date >= '${monthStr}-01' AND stats.date < ('${monthStr}-01'::date + INTERVAL '1 month')`;
            } else {
                // 2025-09 형태인 경우
                dateCondition = `stats.date >= '${date}-01' AND stats.date < ('${date}-01'::date + INTERVAL '1 month')`;
            }
        }
        
        let queryBuilder = statisticsRepo
            .createQueryBuilder('stats')
            .select('SUM(stats.total_sales_count)', 'total_sales_count')
            .addSelect('SUM(stats.total_sales_price)', 'total_sales_amount')
            .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_granted_count ELSE 0 END)', 'total_coupon_granted_count')
            .addSelect('SUM(CASE WHEN stats.type = 1 THEN stats.total_onetime_use_count ELSE 0 END)', 'total_onetime_use_count')
            .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_coupon_use_count ELSE 0 END)', 'total_coupon_use_count')
            .where(dateCondition);
        
        // 일별인 경우에만 date 파라미터 바인딩
        if (period === 'daily') {
            queryBuilder.setParameter('date', date);
        }
        
        // 필터 조건 추가
        if (service_id !== null && service_id !== undefined && service_id !== '') {
            queryBuilder.andWhere('stats.service_id = :service_id', { service_id: parseInt(service_id) });
        }
        
        if (type !== null && type !== undefined && type !== '') {
            queryBuilder.andWhere('stats.type = :type', { type: parseInt(type) });
        }
        
        if (user_type !== null && user_type !== undefined && user_type !== '') {
            queryBuilder.andWhere('stats.user_type = :user_type', { user_type: parseInt(user_type) });
        }
        
        const result = await queryBuilder.getRawOne();
        
        // 결과 정리 (null 값을 0으로 변환)
        return {
            total_sales_count: parseInt(result.total_sales_count) || 0,
            total_sales_amount: parseFloat(result.total_sales_amount) || 0,
            total_coupon_granted_count: parseInt(result.total_coupon_granted_count) || 0,
            total_onetime_use_count: parseInt(result.total_onetime_use_count) || 0,
            total_coupon_use_count: parseInt(result.total_coupon_use_count) || 0
        };
    } catch (error) {
        throw new Error('대시보드 데이터 조회 오류: ' + error.message);
    }
}

//7일치/7개월치 "구매건수"리스트 + "쿠폰지급건수"리스트
export async function getAssetsData(params) {
    const { dateRange, service_id, type, user_type, period } = params;

    //console.log(" dateRange : ", dateRange);
    try {
        const statisticsRepo = AppDataSource_admin.getRepository(Statistics);

        // dateRange가 비어있으면 에러 반환
        if (!dateRange || dateRange.length === 0) {
            throw new Error('날짜 범위가 비어있습니다.');
        }

        // 월별 집계인지 일별 집계인지 확인 (period 파라미터로 판단)
        const isMonthly = period === 'month';

        // service_id가 없으면 서비스별로 그룹화
        const groupByService = (service_id === null || service_id === undefined || service_id === '');

        let queryBuilder = statisticsRepo
            .createQueryBuilder('stats');

        if (isMonthly) {
            // 월별 집계: YYYY-MM 형식으로 그룹화
            if (groupByService) {
                queryBuilder
                    .select('stats.service_id', 'service_id')
                    .addSelect('TO_CHAR(stats.date, \'YYYY-MM\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type != 0 THEN stats.total_sales_count ELSE 0 END)', 'sales_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_granted_count ELSE 0 END)', 'coupon_granted_count')
                    .where('TO_CHAR(stats.date, \'YYYY-MM\') IN (:...monthRange)', {
                        monthRange: dateRange.map(date => date.substring(0, 7))
                    });
            } else {
                queryBuilder
                    .select('TO_CHAR(stats.date, \'YYYY-MM\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type != 0 THEN stats.total_sales_count ELSE 0 END)', 'sales_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_granted_count ELSE 0 END)', 'coupon_granted_count')
                    .where('TO_CHAR(stats.date, \'YYYY-MM\') IN (:...monthRange)', {
                        monthRange: dateRange.map(date => date.substring(0, 7))
                    });
            }
        } else {
            // 일별 집계: YYYY-MM-DD 형식
            if (groupByService) {
                queryBuilder
                    .select('stats.service_id', 'service_id')
                    .addSelect('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type != 0 THEN stats.total_sales_count ELSE 0 END)', 'sales_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_granted_count ELSE 0 END)', 'coupon_granted_count')
                    .where('stats.date IN (:...dateRange)', { dateRange });
            } else {
                queryBuilder
                    .select('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type != 0 THEN stats.total_sales_count ELSE 0 END)', 'sales_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_granted_count ELSE 0 END)', 'coupon_granted_count')
                    .where('stats.date IN (:...dateRange)', { dateRange });
            }
        }

        if (service_id !== null && service_id !== undefined && service_id !== '') {
            queryBuilder.andWhere('stats.service_id = :service_id', { service_id: parseInt(service_id) });
        }

        if (type !== null && type !== undefined && type !== '') {
            queryBuilder.andWhere('stats.type = :type', { type: parseInt(type) });
        }

        if (user_type !== null && user_type !== undefined && user_type !== '') {
            queryBuilder.andWhere('stats.user_type = :user_type', { user_type: parseInt(user_type) });
        }

        let result;
        if (isMonthly) {
            if (groupByService) {
                result = await queryBuilder
                    .groupBy('stats.service_id, TO_CHAR(stats.date, \'YYYY-MM\')')
                    .orderBy('stats.service_id', 'ASC')
                    .addOrderBy('TO_CHAR(stats.date, \'YYYY-MM\')', 'DESC')
                    .getRawMany();
            } else {
                result = await queryBuilder
                    .groupBy('TO_CHAR(stats.date, \'YYYY-MM\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM\')', 'DESC')
                    .getRawMany();
            }
        } else {
            if (groupByService) {
                result = await queryBuilder
                    .groupBy('stats.service_id, TO_CHAR(stats.date, \'YYYY-MM-DD\')')
                    .orderBy('stats.service_id', 'ASC')
                    .addOrderBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'DESC')
                    .getRawMany();
            } else {
                result = await queryBuilder
                    .groupBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'DESC')
                    .getRawMany();
            }
        }

        // 쿼리 결과 로그 출력
        //console.log('📊 AssetsData Query Result:', JSON.stringify(result, null, 2));
        //result.forEach(row => {
        //    console.log(`📅 ${row.date}: sales_count=${row.sales_count}, coupon_granted_count=${row.coupon_granted_count}`);
        //});

        if (groupByService) {
            // service_id별로 그룹화된 결과 반환
            const serviceGroups = new Map();

            result.forEach(row => {
                const serviceId = row.service_id;
                if (!serviceGroups.has(serviceId)) {
                    serviceGroups.set(serviceId, new Map());
                }
                serviceGroups.get(serviceId).set(row.date, {
                    sales_count: parseInt(row.sales_count) || 0,
                    coupon_granted_count: parseInt(row.coupon_granted_count) || 0
                });
            });

            // 각 서비스별로 날짜 범위에 맞게 데이터 구성
            const serviceData = [];
            serviceGroups.forEach((dateMap, serviceId) => {
                const dates = [];
                if (isMonthly) {
                    dateRange.forEach(date => {
                        const monthKey = date.substring(0, 7);
                        dates.push({
                            date: monthKey,
                            sales_count: dateMap.get(monthKey)?.sales_count || 0,
                            coupon_granted_count: dateMap.get(monthKey)?.coupon_granted_count || 0
                        });
                    });
                } else {
                    dateRange.forEach(date => {
                        dates.push({
                            date: date,
                            sales_count: dateMap.get(date)?.sales_count || 0,
                            coupon_granted_count: dateMap.get(date)?.coupon_granted_count || 0
                        });
                    });
                }

                serviceData.push({
                    service_id: serviceId,
                    data: dates
                });
            });

            return serviceData;

        } else {
            // 기존 로직: 날짜별 데이터만 반환
            const dataMap = new Map();
            result.forEach(row => {
                dataMap.set(row.date, {
                    sales_count: parseInt(row.sales_count) || 0,
                    coupon_granted_count: parseInt(row.coupon_granted_count) || 0
                });
            });

            if (isMonthly) {
                // 월별 데이터: dateRange의 날짜를 YYYY-MM 형식으로 매핑
                return dateRange.map(date => {
                    const monthKey = date.substring(0, 7); // YYYY-MM
                    return {
                        date: monthKey,
                        sales_count: dataMap.get(monthKey)?.sales_count || 0,
                        coupon_granted_count: dataMap.get(monthKey)?.coupon_granted_count || 0
                    };
                });
            } else {
                // 일별 데이터
                return dateRange.map(date => ({
                    date: date,
                    sales_count: dataMap.get(date)?.sales_count || 0,
                    coupon_granted_count: dataMap.get(date)?.coupon_granted_count || 0
                }));
            }
        }
    } catch (error) {
        throw new Error('구매건수 데이터 조회 오류: ' + error.message);
    }
}

export async function getSalesData(params) {
    const { dateRange, service_id, type, user_type, period } = params;

    //console.log(" salesData dateRange : ", dateRange);

    if (!dateRange || dateRange.length === 0) {
        throw new Error('날짜 범위가 비어있습니다.');
    }

    try {
        const statisticsRepo = AppDataSource_admin.getRepository(Statistics);

        // 월별 집계인지 일별 집계인지 확인 (period 파라미터로 판단)
        const isMonthly = period === 'month';

        // service_id가 없으면 서비스별로 그룹화
        const groupByService = (service_id === null || service_id === undefined || service_id === '');

        let queryBuilder = statisticsRepo
            .createQueryBuilder('stats');

        if (groupByService) {
            // 서비스별 그룹화
            if (isMonthly) {
                queryBuilder
                    .select('stats.service_id', 'service_id')
                    .addSelect('TO_CHAR(stats.date, \'YYYY-MM\')', 'date')
                    .addSelect('SUM(stats.total_sales_price)', 'sales_amount')
                    .where('TO_CHAR(stats.date, \'YYYY-MM\') IN (:...monthRange)', {
                        monthRange: dateRange.map(date => date.substring(0, 7))
                    });
            } else {
                queryBuilder
                    .select('stats.service_id', 'service_id')
                    .addSelect('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'date')
                    .addSelect('SUM(stats.total_sales_price)', 'sales_amount')
                    .where('stats.date IN (:...dateRange)', { dateRange });
            }
        } else {
            // 특정 서비스
            if (isMonthly) {
                queryBuilder
                    .select('TO_CHAR(stats.date, \'YYYY-MM\')', 'date')
                    .addSelect('SUM(stats.total_sales_price)', 'sales_amount')
                    .where('TO_CHAR(stats.date, \'YYYY-MM\') IN (:...monthRange)', {
                        monthRange: dateRange.map(date => date.substring(0, 7))
                    })
                    .andWhere('stats.service_id = :service_id', { service_id: parseInt(service_id) });
            } else {
                queryBuilder
                    .select('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'date')
                    .addSelect('SUM(stats.total_sales_price)', 'sales_amount')
                    .where('stats.date IN (:...dateRange)', { dateRange })
                    .andWhere('stats.service_id = :service_id', { service_id: parseInt(service_id) });
            }
        }

        if (type !== null && type !== undefined && type !== '') {
            queryBuilder.andWhere('stats.type = :type', { type: parseInt(type) });
        }

        if (user_type !== null && user_type !== undefined && user_type !== '') {
            queryBuilder.andWhere('stats.user_type = :user_type', { user_type: parseInt(user_type) });
        }

        let result;
        if (groupByService) {
            if (isMonthly) {
                result = await queryBuilder
                    .groupBy('stats.service_id, TO_CHAR(stats.date, \'YYYY-MM\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM\')', 'DESC')
                    .addOrderBy('stats.service_id', 'ASC')
                    .getRawMany();
            } else {
                result = await queryBuilder
                    .groupBy('stats.service_id, TO_CHAR(stats.date, \'YYYY-MM-DD\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'DESC')
                    .addOrderBy('stats.service_id', 'ASC')
                    .getRawMany();
            }
        } else {
            if (isMonthly) {
                result = await queryBuilder
                    .groupBy('TO_CHAR(stats.date, \'YYYY-MM\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM\')', 'DESC')
                    .getRawMany();
            } else {
                result = await queryBuilder
                    .groupBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'DESC')
                    .getRawMany();
            }
        }

        // 쿼리 결과 로그 출력
        //console.log('💰 SalesData Query Result:', JSON.stringify(result, null, 2));
        //result.forEach(row => {
       //     console.log(`📅 ${row.date}: sales_amount=${row.sales_amount}`);
       // });

        if (groupByService) {
            // 서비스별로 그룹화된 결과를 날짜 중심으로 변환
            const serviceMap = new Map();

            result.forEach(row => {
                const serviceId = parseInt(row.service_id);
                if (!serviceMap.has(serviceId)) {
                    serviceMap.set(serviceId, {
                        service_id: serviceId,
                        data: []
                    });
                }

                serviceMap.get(serviceId).data.push({
                    date: row.date,
                    sales_amount: parseFloat(row.sales_amount) || 0
                });
            });

            // 누락된 날짜에 대해 0으로 채우기
            serviceMap.forEach((serviceData, serviceId) => {
                const dataMap = new Map();
                serviceData.data.forEach(item => {
                    dataMap.set(item.date, item.sales_amount);
                });

                if (isMonthly) {
                    serviceData.data = dateRange.map(date => {
                        const monthKey = date.substring(0, 7);
                        return {
                            date: monthKey,
                            sales_amount: dataMap.get(monthKey) || 0
                        };
                    });
                } else {
                    serviceData.data = dateRange.map(date => ({
                        date: date,
                        sales_amount: dataMap.get(date) || 0
                    }));
                }
            });

            return Array.from(serviceMap.values());
        } else {
            // 단일 서비스 결과
            const dataMap = new Map();
            result.forEach(row => {
                dataMap.set(row.date, parseFloat(row.sales_amount) || 0);
            });

            if (isMonthly) {
                return dateRange.map(date => {
                    const monthKey = date.substring(0, 7);
                    return {
                        date: monthKey,
                        sales_amount: dataMap.get(monthKey) || 0
                    };
                });
            } else {
                return dateRange.map(date => ({
                    date: date,
                    sales_amount: dataMap.get(date) || 0
                }));
            }
        }
    } catch (error) {
        throw new Error('매출액 데이터 조회 오류: ' + error.message);
    }
}

export async function getActionData(params) {
    const { dateRange, service_id, type, user_type, period } = params;

    //console.log(" actionData dateRange : ", dateRange);

    if (!dateRange || dateRange.length === 0) {
        throw new Error('날짜 범위가 비어있습니다.');
    }

    try {
        const statisticsRepo = AppDataSource_admin.getRepository(Statistics);

        // 월별 집계인지 일별 집계인지 확인 (period 파라미터로 판단)
        const isMonthly = period === 'month';

        // service_id가 없으면 서비스별로 그룹화
        const groupByService = (service_id === null || service_id === undefined || service_id === '');

        let queryBuilder = statisticsRepo
            .createQueryBuilder('stats');

        if (groupByService) {
            // 서비스별 그룹화
            if (isMonthly) {
                queryBuilder
                    .select('stats.service_id', 'service_id')
                    .addSelect('TO_CHAR(stats.date, \'YYYY-MM\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type = 1 THEN stats.total_onetime_use_count ELSE 0 END)', 'onetime_use_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_coupon_use_count ELSE 0 END)', 'coupon_use_count')
                    .where('TO_CHAR(stats.date, \'YYYY-MM\') IN (:...monthRange)', {
                        monthRange: dateRange.map(date => date.substring(0, 7))
                    });
            } else {
                queryBuilder
                    .select('stats.service_id', 'service_id')
                    .addSelect('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type = 1 THEN stats.total_onetime_use_count ELSE 0 END)', 'onetime_use_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_coupon_use_count ELSE 0 END)', 'coupon_use_count')
                    .where('stats.date IN (:...dateRange)', { dateRange });
            }
        } else {
            // 특정 서비스
            if (isMonthly) {
                queryBuilder
                    .select('TO_CHAR(stats.date, \'YYYY-MM\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type = 1 THEN stats.total_onetime_use_count ELSE 0 END)', 'onetime_use_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_coupon_use_count ELSE 0 END)', 'coupon_use_count')
                    .where('TO_CHAR(stats.date, \'YYYY-MM\') IN (:...monthRange)', {
                        monthRange: dateRange.map(date => date.substring(0, 7))
                    })
                    .andWhere('stats.service_id = :service_id', { service_id: parseInt(service_id) });
            } else {
                queryBuilder
                    .select('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'date')
                    .addSelect('SUM(CASE WHEN stats.type = 1 THEN stats.total_onetime_use_count ELSE 0 END)', 'onetime_use_count')
                    .addSelect('SUM(CASE WHEN stats.type = 0 THEN stats.total_coupon_use_count ELSE 0 END)', 'coupon_use_count')
                    .where('stats.date IN (:...dateRange)', { dateRange })
                    .andWhere('stats.service_id = :service_id', { service_id: parseInt(service_id) });
            }
        }

        if (type !== null && type !== undefined && type !== '') {
            queryBuilder.andWhere('stats.type = :type', { type: parseInt(type) });
        }

        if (user_type !== null && user_type !== undefined && user_type !== '') {
            queryBuilder.andWhere('stats.user_type = :user_type', { user_type: parseInt(user_type) });
        }

        let result;
        if (groupByService) {
            if (isMonthly) {
                result = await queryBuilder
                    .groupBy('stats.service_id, TO_CHAR(stats.date, \'YYYY-MM\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM\')', 'DESC')
                    .addOrderBy('stats.service_id', 'ASC')
                    .getRawMany();
            } else {
                result = await queryBuilder
                    .groupBy('stats.service_id, TO_CHAR(stats.date, \'YYYY-MM-DD\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'DESC')
                    .addOrderBy('stats.service_id', 'ASC')
                    .getRawMany();
            }
        } else {
            if (isMonthly) {
                result = await queryBuilder
                    .groupBy('TO_CHAR(stats.date, \'YYYY-MM\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM\')', 'DESC')
                    .getRawMany();
            } else {
                result = await queryBuilder
                    .groupBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')')
                    .orderBy('TO_CHAR(stats.date, \'YYYY-MM-DD\')', 'DESC')
                    .getRawMany();
            }
        }

        // 쿼리 결과 로그 출력
       // console.log('🎯 ActionData Query Result:', JSON.stringify(result, null, 2));
       // result.forEach(row => {
       //     console.log(`📅 ${row.date}: onetime_use_count=${row.onetime_use_count}, coupon_use_count=${row.coupon_use_count}`);
       // });

        if (groupByService) {
            // 서비스별로 그룹화된 결과를 날짜 중심으로 변환
            const serviceMap = new Map();

            result.forEach(row => {
                const serviceId = parseInt(row.service_id);
                if (!serviceMap.has(serviceId)) {
                    serviceMap.set(serviceId, {
                        service_id: serviceId,
                        data: []
                    });
                }

                serviceMap.get(serviceId).data.push({
                    date: row.date,
                    onetime_use_count: parseInt(row.onetime_use_count) || 0,
                    coupon_use_count: parseInt(row.coupon_use_count) || 0
                });
            });

            // 누락된 날짜에 대해 0으로 채우기
            serviceMap.forEach((serviceData, serviceId) => {
                const dataMap = new Map();
                serviceData.data.forEach(item => {
                    dataMap.set(item.date, {
                        onetime_use_count: item.onetime_use_count,
                        coupon_use_count: item.coupon_use_count
                    });
                });

                if (isMonthly) {
                    serviceData.data = dateRange.map(date => {
                        const monthKey = date.substring(0, 7);
                        return {
                            date: monthKey,
                            onetime_use_count: dataMap.get(monthKey)?.onetime_use_count || 0,
                            coupon_use_count: dataMap.get(monthKey)?.coupon_use_count || 0
                        };
                    });
                } else {
                    serviceData.data = dateRange.map(date => ({
                        date: date,
                        onetime_use_count: dataMap.get(date)?.onetime_use_count || 0,
                        coupon_use_count: dataMap.get(date)?.coupon_use_count || 0
                    }));
                }
            });

            return Array.from(serviceMap.values());
        } else {
            // 단일 서비스 결과
            const dataMap = new Map();
            result.forEach(row => {
                dataMap.set(row.date, {
                    onetime_use_count: parseInt(row.onetime_use_count) || 0,
                    coupon_use_count: parseInt(row.coupon_use_count) || 0
                });
            });

            if (isMonthly) {
                return dateRange.map(date => {
                    const monthKey = date.substring(0, 7);
                    return {
                        date: monthKey,
                        onetime_use_count: dataMap.get(monthKey)?.onetime_use_count || 0,
                        coupon_use_count: dataMap.get(monthKey)?.coupon_use_count || 0
                    };
                });
            } else {
                return dateRange.map(date => ({
                    date: date,
                    onetime_use_count: dataMap.get(date)?.onetime_use_count || 0,
                    coupon_use_count: dataMap.get(date)?.coupon_use_count || 0
                }));
            }
        }
    } catch (error) {
        throw new Error('이용건수 데이터 조회 오류: ' + error.message);
    }
}

