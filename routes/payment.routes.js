import express from 'express';
import * as paymentController from "../controllers/payment.controller.js";

const router = express.Router();

// 결제내역
router.get('/history/:page/:limit', paymentController.getPaymentHistory); // 1.모든 테넌트의 결제 내역 조회(검색 가능)
router.get('/detail/:payment_id/:user_id', paymentController.getPaymentDetail); // 3.결제 상세 내역 조회

// 취소관리
router.get('/cancelHistory/:page/:limit', paymentController.getCancelHistory); // 4.취소내역 전체 조회(검색 가능)
router.get('/cancelDetail/:cancel_id/:user_id', paymentController.getCancelDetail); // 5.취소 상세 내역 조회
router.post('/reject/cancelRequest/:cancel_id/:user_id', paymentController.rejectCancelRequest) // 6.취소반려
router.post('/confirm/cancelRequest/:cancel_id/:user_id', paymentController.confirmCancelRequest) // 7.전액환불
// router.post('/process/cancelRequest/:cancel_id/:user_id', paymentController.processCancelRequest); 

export default router;