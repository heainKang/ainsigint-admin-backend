import express from 'express';
import * as statisticController from '../controllers/statistic.controller.js';

const router = express.Router();

// 배치 관리
router.post('/batch/run', statisticController.runBatch); // 수동배치 
//  {
//    "date": "2025-09-08"
//  }
router.get('/batch/status', statisticController.getBatchStatus);// 새벽2시 inrunning 유무 갖어오는건데 사용하진않고있음.

// 1. 일별현황
router.get('/daily/:date', statisticController.getDailyStatus);

// 2. 미처리 현황
router.get('/unresolved', statisticController.getUnresolved);

// 3. 서비스유형
router.get('/services', statisticController.getServices);

// 4. 일/월별 대시보드 정보
router.get('/dashboard', statisticController.getDashboard);

// 7일치/7개월치 "구매건수/쿠폰지급건수" 리스트
router.get('/assetsList', statisticController.getAssetsList);

// 7일치/7개월치 "매출액" 리스트
router.get('/salesList', statisticController.getSalesList);

// 7일치/7개월치 "이용건수" 리스트 (1회+쿠폰)
router.get('/actionList', statisticController.getActionList);

export default router;