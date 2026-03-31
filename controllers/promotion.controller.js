import * as promotionService from '../services/promotion.service.js';

// 모든 테넌트 요청(테스트)
export async function giveCoupon(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const info = req.body;
    const result = await promotionService.giveCoupon(info);

    res.json(result);
}

// 모든 테넌트 요청(테스트)
export async function couponHistory(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    console.log("info == ", info);

    // 조건들
    // 치과명, 지급기간(start_date, end_date), 국내, 국외

    const result = await promotionService.getCouponHistoryList(page, limit, info);

    res.json(result);
}

// 쿠폰 상세 내역 조회
export async function couponDetailHistory(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const coupon_id = req.params.coupon_id;
    const info = req.query;

    const result = await promotionService.getCouponDetailHistory(coupon_id, info);

    res.json(result);
}

// 회원가입 쿠폰, 1회 이용권 구매 쿠폰 수정
export async function updateCoupon(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
    const info = req.body;

    console.log("update_coupon info == ", info);
    const result = await promotionService.updateCoupon(info);

    res.json(result);
}

// 회원가입 쿠폰, 1회 이용권 구매 쿠폰 수정
export async function couponSetting(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);

    const result = await promotionService.couponSetting();

    res.json(result);
}