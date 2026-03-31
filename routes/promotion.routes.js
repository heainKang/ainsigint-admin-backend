import express from 'express';
import * as promotionController from "../controllers/promotion.controller.js";

const router = express.Router();

// 회원조회
router.post('/create', promotionController.giveCoupon); // 쿠폰 지급
router.get('/couponHistory/:page/:limit', promotionController.couponHistory) // 지급내역
router.get('/couponDetailHistory/:coupon_id', promotionController.couponDetailHistory); // 쿠폰 지급 상세 내역 조회

router.get('/couponSetting', promotionController.couponSetting); // 쿠폰 세팅창 조회
router.put('/update/coupon', promotionController.updateCoupon); // 쿠폰 지급 수량, 사용기한 수정

export default router;