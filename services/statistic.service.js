import * as statisticRepository from '../repositories/statistic.repository.js';

export async function getDailyStatus(date) {
    try {
        const result = await statisticRepository.getDailyStatusData(date);
        return result;
    } catch (error) {
        throw new Error('일별현황 데이터 처리 중 오류: ' + error.message);
    }
}

export async function getUnresolved() {
    try {
        const result = await statisticRepository.getUnresolvedData();
        return result;
    } catch (error) {
        throw new Error('미처리 현황 데이터 처리 중 오류: ' + error.message);
    }
}

export async function getServices() {
    try {
        const result = await statisticRepository.getServicesData();
        return result;
    } catch (error) {
        throw new Error('서비스유형 데이터 처리 중 오류: ' + error.message);
    }
}

export async function getDashboard(params) {
    const { date, period, service_id, type, user_type } = params;
    
    try {
        const result = await statisticRepository.getDashboardData({
            date,
            period,
            service_id,
            type,
            user_type
        });

        return result;
    } catch (error) {
        throw new Error('대시보드 데이터 처리 중 오류: ' + error.message);
    }
}

export async function getAssetsList(params) {
    const { date, period, service_id, type, user_type } = params;

    try {
        const dateRange = generateDateRange(date, period);
        const assetsData = await statisticRepository.getAssetsData({
            dateRange,
            service_id,
            type,
            user_type,
            period
        });

        // service_id가 없으면 날짜별로 그룹화된 데이터 반환
        if (service_id === null || service_id === undefined || service_id === '') {

            // 날짜별 그룹화된 형태로 변환
            const dateGroupedData = [];
            const dateMap = new Map();

            if (Array.isArray(assetsData)) {
                // 모든 서비스 데이터를 날짜별로 그룹화
                assetsData.forEach(serviceData => {
                    serviceData.data.forEach(dateData => {
                        if (!dateMap.has(dateData.date)) {
                            dateMap.set(dateData.date, {
                                date: dateData.date,
                                total_sales_count: 0,
                                total_coupon_granted_count: 0,
                                services: []
                            });
                        }
                        const dateEntry = dateMap.get(dateData.date);
                        dateEntry.total_sales_count += dateData.sales_count;
                        dateEntry.total_coupon_granted_count += dateData.coupon_granted_count;
                        dateEntry.services.push({
                            service_id: serviceData.service_id,
                            sales_count: dateData.sales_count,
                            coupon_granted_count: dateData.coupon_granted_count
                        });
                    });
                });

                // Map을 배열로 변환하고 날짜순 정렬
                dateGroupedData.push(...Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date)));
            }

            return dateGroupedData;
        }

        // service_id가 있는 경우도 동일한 형태로 변환
        const dateGroupedData = [];

        if (Array.isArray(assetsData)) {
            assetsData.forEach(dateData => {
                dateGroupedData.push({
                    date: dateData.date,
                    total_sales_count: dateData.sales_count,
                    total_coupon_granted_count: dateData.coupon_granted_count,
                    services: [{
                        service_id: parseInt(service_id),
                        sales_count: dateData.sales_count,
                        coupon_granted_count: dateData.coupon_granted_count
                    }]
                });
            });
        }

        return dateGroupedData;
    } catch (error) {
        throw new Error('구매건수 데이터 처리 중 오류: ' + error.message);
    }
}

export async function getSalesList(params) {
    const { date, period, service_id, type, user_type } = params;

    try {
        const dateRange = generateDateRange(date, period);
        const salesData = await statisticRepository.getSalesData({
            dateRange,
            service_id,
            type,
            user_type,
            period
        });

        // service_id가 없으면 날짜별로 그룹화된 데이터 반환
        if (service_id === null || service_id === undefined || service_id === '') {
            // 날짜별 그룹화된 형태로 변환
            const dateGroupedData = [];
            const dateMap = new Map();

            if (Array.isArray(salesData)) {
                // 모든 서비스 데이터를 날짜별로 그룹화
                salesData.forEach(serviceData => {
                    serviceData.data.forEach(dateData => {
                        if (!dateMap.has(dateData.date)) {
                            dateMap.set(dateData.date, {
                                date: dateData.date,
                                total_sales_amount: 0,
                                services: []
                            });
                        }
                        const dateEntry = dateMap.get(dateData.date);
                        dateEntry.total_sales_amount += dateData.sales_amount;
                        dateEntry.services.push({
                            service_id: serviceData.service_id,
                            sales_amount: dateData.sales_amount
                        });
                    });
                });

                // Map을 배열로 변환하고 날짜순 정렬
                dateGroupedData.push(...Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date)));
            }

            return dateGroupedData;
        }

        // service_id가 있는 경우도 동일한 형태로 변환
        const dateGroupedData = [];

        if (Array.isArray(salesData)) {
            salesData.forEach(dateData => {
                dateGroupedData.push({
                    date: dateData.date,
                    total_sales_amount: dateData.sales_amount,
                    services: [{
                        service_id: parseInt(service_id),
                        sales_amount: dateData.sales_amount
                    }]
                });
            });
        }

        return dateGroupedData;
    } catch (error) {
        throw new Error('매출액 데이터 처리 중 오류: ' + error.message);
    }
}

export async function getActionList(params) {
    const { date, period, service_id, type, user_type } = params;

    try {
        const dateRange = generateDateRange(date, period);
        const actionData = await statisticRepository.getActionData({
            dateRange,
            service_id,
            type,
            user_type,
            period
        });

        // service_id가 없으면 날짜별로 그룹화된 데이터 반환
        if (service_id === null || service_id === undefined || service_id === '') {
            // 날짜별 그룹화된 형태로 변환
            const dateGroupedData = [];
            const dateMap = new Map();

            if (Array.isArray(actionData)) {
                // 모든 서비스 데이터를 날짜별로 그룹화
                actionData.forEach(serviceData => {
                    serviceData.data.forEach(dateData => {
                        if (!dateMap.has(dateData.date)) {
                            dateMap.set(dateData.date, {
                                date: dateData.date,
                                total_onetime_use_count: 0,
                                total_coupon_use_count: 0,
                                services: []
                            });
                        }
                        const dateEntry = dateMap.get(dateData.date);
                        dateEntry.total_onetime_use_count += dateData.onetime_use_count;
                        dateEntry.total_coupon_use_count += dateData.coupon_use_count;
                        dateEntry.services.push({
                            service_id: serviceData.service_id,
                            onetime_use_count: dateData.onetime_use_count,
                            coupon_use_count: dateData.coupon_use_count
                        });
                    });
                });

                // Map을 배열로 변환하고 날짜순 정렬
                dateGroupedData.push(...Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date)));
            }

            return dateGroupedData;
        }

        // service_id가 있는 경우도 동일한 형태로 변환
        const dateGroupedData = [];

        if (Array.isArray(actionData)) {
            actionData.forEach(dateData => {
                dateGroupedData.push({
                    date: dateData.date,
                    total_onetime_use_count: dateData.onetime_use_count,
                    total_coupon_use_count: dateData.coupon_use_count,
                    services: [{
                        service_id: parseInt(service_id),
                        onetime_use_count: dateData.onetime_use_count,
                        coupon_use_count: dateData.coupon_use_count
                    }]
                });
            });
        }

        return dateGroupedData;
    } catch (error) {
        throw new Error('이용건수 데이터 처리 중 오류: ' + error.message);
    }
}

// 날짜 범위 함수!!!!
function generateDateRange(baseDate, period) {
    const base = new Date(baseDate);
    const dateRange = [];

    // period를 정규화: 제어 문자 제거, trim, 소문자 변환
    const normalizedPeriod = String(period).replace(/[\x00-\x1F\x7F]/g, '').trim().toLowerCase();

    if (normalizedPeriod === 'daily') {
        // 7일치 데이터 (최신날짜부터 내림차순)
        for (let i = 0; i <= 6; i++) {
           //for (let i = 6; i >= 0; i--) { 오름차순
            const date = new Date(base);
            date.setDate(base.getDate() - i);
            dateRange.push(date.toISOString().split('T')[0]);
        }
    } else if (normalizedPeriod === 'month') {
        // 7개월치 데이터 (최신월부터 내림차순)
        //console.log('📅 Processing monthly period');
        for (let i = 0; i <= 6; i++) {
            const date = new Date(base);
            date.setMonth(base.getMonth() - i);
            date.setDate(1); // 월 첫날로 설정
            const dateStr = date.toISOString().split('T')[0];
            //console.log(`📅 Monthly date ${i}: ${dateStr}`);
            dateRange.push(dateStr);
        }
    } else {
        console.log(`❌ Unknown period: ${period}`);
    }
    return dateRange;
}