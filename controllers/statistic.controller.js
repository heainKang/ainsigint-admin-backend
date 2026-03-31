import * as statisticService from '../services/statistic.service.js';
import { StatisticsBatchScheduler } from '../utils/statisticsBatchScheduler.js';

const batchScheduler = new StatisticsBatchScheduler();

export async function runBatch(req, res) {
    try {
        const { date } = req.body;
        
        // 날짜 형식 검증 (일별: YYYY-MM-DD, 월별: YYYY-MM)
        if (date && !/^\d{4}-\d{2}(-\d{2})?$/.test(date)) {
            return res.status(400).json({
                success: false,
                message: '날짜 형식이 올바르지 않습니다. YYYY-MM-DD(일별) 또는 YYYY-MM(월별) 형식으로 입력해주세요.',
                examples: ['2025-01-15', '2025-07']
            });
        }
        
        const batchResult = await batchScheduler.runManualBatch(date);
        
        // 월별/일별 배치 결과 처리
        let isOverallSuccess, responseData;
        
        if (batchResult.month) {
            // 월별 배치 결과
            isOverallSuccess = batchResult.failed_days === 0;
            responseData = {
                success: isOverallSuccess,
                message: isOverallSuccess
                    ? `월별 통계 배치가 성공적으로 실행되었습니다. (${batchResult.total_days}일)`
                    : `월별 통계 배치가 부분적으로 실행되었습니다. (성공: ${batchResult.successful_days}일, 실패: ${batchResult.failed_days}일)`,
                target_month: batchResult.month,
                batch_details: {
                    type: 'monthly',
                    total_days: batchResult.total_days,
                    successful_days: batchResult.successful_days,
                    failed_days: batchResult.failed_days,
                    total_tenants: batchResult.total_tenants,
                    daily_results: batchResult.daily_results,
                    errors: batchResult.errors
                }
            };
        } else {
            // 일별 배치 결과
            isOverallSuccess = batchResult.failed_tenants === 0;
            responseData = {
                success: isOverallSuccess,
                message: isOverallSuccess 
                    ? '통계 배치가 성공적으로 실행되었습니다.' 
                    : `통계 배치가 부분적으로 실행되었습니다. (성공: ${batchResult.successful_tenants}, 실패: ${batchResult.failed_tenants})`,
                target_date: date || '어제 (자동)',
                executed_date: date || new Date(Date.now() - 86400000).toISOString().split('T')[0],
                batch_details: {
                    type: 'daily',
                    total_tenants: batchResult.total_tenants,
                    successful_tenants: batchResult.successful_tenants,
                    failed_tenants: batchResult.failed_tenants,
                    tenant_results: batchResult.tenant_results,
                    errors: batchResult.errors
                }
            };
        }
        
        res.status(isOverallSuccess ? 200 : 207).json(responseData);
    } catch (error) {
        console.error('runBatch error:', error);
        
        // 에러 객체에 details가 있으면 상세 정보 포함
        if (error.details) {
            return res.status(500).json({
                success: false,
                message: '통계 배치 실행 중 오류가 발생했습니다.',
                error: error.message,
                batch_details: error.details
            });
        }
        
        res.status(500).json({
            success: false,
            message: '통계 배치 실행 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getBatchStatus(req, res) {
    try {
        const status = await batchScheduler.getStatus();
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('getBatchStatus error:', error);
        res.status(500).json({
            success: false,
            message: '배치 상태 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}


export async function getDailyStatus(req, res) {
    try {
        console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
        const { date } = req.params;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'date는 필수 파라미터입니다.'
            });
        }

        const result = await statisticService.getDailyStatus(date);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getDailyStatus error:', error);
        res.status(500).json({
            success: false,
            message: '일별현황 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getUnresolved(req, res) {
    try {
        console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
        const result = await statisticService.getUnresolved();

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getUnresolved error:', error);
        res.status(500).json({
            success: false,
            message: '미처리 현황 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getServices(req, res) {
    try {
        const result = await statisticService.getServices();

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getServices error:', error);
        res.status(500).json({
            success: false,
            message: '서비스유형 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getDashboard(req, res) {
    try {
        const { date, period, service_id, type, user_type } = req.query;
        
        if (!date || !period) {
            return res.status(400).json({
                success: false,
                message: 'date와 period는 필수 파라미터입니다.'
            });
        }

        const result = await statisticService.getDashboard({
            date,
            period,
            service_id: service_id || null,
            type: type || null,
            user_type: user_type || null
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getDashboard error:', error);
        res.status(500).json({
            success: false,
            message: '대시보드 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getAssetsList(req, res) {
    try {
        const { date, period, service_id, type, user_type } = req.query;
        
        if (!date || !period) {
            return res.status(400).json({
                success: false,
                message: 'date와 period는 필수 파라미터입니다.'
            });
        }

        const result = await statisticService.getAssetsList({
            date,
            period,
            service_id: service_id || null,
            type: type || null,
            user_type: user_type || null
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getAssetsList error:', error);
        res.status(500).json({
            success: false,
            message: '구매건수 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getSalesList(req, res) {
    try {
        const { date, period, service_id, type, user_type } = req.query;
        
        if (!date || !period) {
            return res.status(400).json({
                success: false,
                message: 'date와 period는 필수 파라미터입니다.'
            });
        }

        const result = await statisticService.getSalesList({
            date,
            period,
            service_id: service_id || null,
            type: type || null,
            user_type: user_type || null
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getSalesList error:', error);
        res.status(500).json({
            success: false,
            message: '매출액 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

export async function getActionList(req, res) {
    try {
        const { date, period, service_id, type, user_type } = req.query;
        
        if (!date || !period) {
            return res.status(400).json({
                success: false,
                message: 'date와 period는 필수 파라미터입니다.'
            });
        }

        const result = await statisticService.getActionList({
            date,
            period,
            service_id: service_id || null,
            type: type || null,
            user_type: user_type || null
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('getActionList error:', error);
        res.status(500).json({
            success: false,
            message: '이용건수 조회 중 오류가 발생했습니다.',
            error: error.message
        });
    }
}

