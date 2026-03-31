import cron from 'node-cron';
import { StatisticsBatchService } from '../services/statistics.batch.service.js';
//스케줄러
export class StatisticsBatchScheduler {
    constructor() {
        this.batchService = new StatisticsBatchService(); //배치!!!!!!!!!!!!
        this.isRunning = false; //중복실행방지 여기 플래그 초기화!!
    }

    // 스케줄러 시작
    async start() {
        // 서버 재시작 시 즉시 배치 실행
        await this.runStartupBatch();

        // 매일 새벽 2시에 전날 통계 집계 실행
        cron.schedule('0 2 * * *', async () => {
            if (this.isRunning) { // ← 실행 중 체크
                console.log('⏸️ 이미 배치가 실행 중입니다. 스킵합니다.');
                return;
            }

            this.isRunning = true; // ← 실행 시작 시 true
            try {
                console.log('🌙 새벽 2시 - 전날 통계 배치 시작');
                await this.batchService.runDailyBatch();
                console.log('✅ 일일 통계 배치 완료');
            } catch (error) {
                console.error('❌ 일일 통계 배치 실패:', error);
            } finally {
                this.isRunning = false;  // ← 완료/실패 시 false
            }
        }, {
            timezone: 'Asia/Seoul'
        });

        console.log('📅 통계 배치 스케줄러 시작됨 (매일 새벽 2시)');
    }

    // 서버 재시작 시 배치 실행
    async runStartupBatch() {
        if (this.isRunning) {
            console.log('⏸️ 이미 배치가 실행 중입니다. 재시작 배치를 스킵합니다.');
            return;
        }

        this.isRunning = true;
        try {
            console.log('🚀 서버 재시작 - 전날 통계 배치 시작');
            await this.batchService.runDailyBatch();
            //console.log('✅ 재시작 시 통계 배치 완료');
        } catch (error) {
            console.error('❌ 재시작 시 통계 배치 실패:', error);
        } finally {
            this.isRunning = false;
        }
    }

    // 수동 실행 (특정 날짜 또는 월별)
    async runManualBatch(targetDate = null) {
        if (this.isRunning) {
            throw new Error('이미 배치가 실행 중입니다.');
        }

        this.isRunning = true;
        try {
            if (targetDate && /^\d{4}-\d{2}$/.test(targetDate)) {
                // 월별 배치 (YYYY-MM 형식)
                console.log(`📅 월별 통계 배치 시작: ${targetDate}`);
                const result = await this.batchService.runMonthlyBatch(targetDate);
                console.log(`✅ 월별 통계 배치 완료: ${targetDate}`);
                return result;
            } else {
                // 일별 배치 (YYYY-MM-DD 형식 또는 null)
                const dateInfo = targetDate ? `특정 날짜: ${targetDate}` : '전날 자동';
                console.log(`🔧 수동 통계 배치 시작 (${dateInfo})`);
                const result = await this.batchService.runDailyBatch(targetDate);
                console.log(`✅ 수동 통계 배치 완료 (${dateInfo})`);
                return result;
            }
        } finally {
            this.isRunning = false;
        }
    }

    // 상태 확인 (배치 완료 여부 포함)
    async getStatus() {
        try {
            // Asia/Seoul 시간대 기준으로 날짜 계산
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString().split('T')[0];
            
            const [todayCompleted, yesterdayCompleted] = await Promise.all([
                this.batchService.checkBatchCompleted(today),
                this.batchService.checkBatchCompleted(yesterday)
            ]);
            
            return {
                isRunning: this.isRunning,
                nextRun: '매일 새벽 2시 (KST)',
                batch_status: {
                    today: {
                        date: today,
                        completed: todayCompleted
                    },
                    yesterday: {
                        date: yesterday,
                        completed: yesterdayCompleted
                    }
                }
            };
        } catch (error) {
            console.error('상태 조회 오류:', error);
            return {
                isRunning: this.isRunning,
                nextRun: '매일 새벽 2시 (KST)',
                batch_status: {
                    error: error.message
                }
            };
        }
    }
    
    /**
     * 🔍 날짜별 배치 완료 여부 확인 (공개 메서드)
     */
    async checkBatchCompleted(date) {
        return await this.batchService.checkBatchCompleted(date);
    }
}