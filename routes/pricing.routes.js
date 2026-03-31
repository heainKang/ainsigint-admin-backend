import express from 'express';
import * as pricingController from "../controllers/pricing.controller.js";

const router = express.Router();

// 홈페이지용 활성화된 요금설정 조회 - GET /api/pricing/homepage?lang=kor
router.get('/homepage', pricingController.getHomepagePricing);

export default router;