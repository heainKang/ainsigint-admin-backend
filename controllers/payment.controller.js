import * as paymentService from '../services/payment.service.js';

// 모든 테넌트 요청(테스트)
// export async function getHistory(req, res) {
//     console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
//     const page = req.params.page;
//     const limit = req.params.limit;
//     const info = req.query;
//     const result = await paymentService.getHistory(page, limit, info);
//     res.json(result);

// }

// 결제 내역 전체 조회
export async function getPaymentHistory(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    const result = await paymentService.getHistories(page, limit, info);
    console.log(`** 응답 ====> 성공`)

    res.json(result);
}

// 모든 테넌트 요청(테스트)
export async function getCancelHistory(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    console.log("page, limit == ", info, page, limit)

    const result = await paymentService.getCancelHistory(page, limit, info);

    res.json(result);
}

// 결제 상세 내역
export async function getPaymentDetail(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    // const page = req.params.page;
    // const limit = req.params.limit;
    const payment_id = req.params.payment_id;
    const user_id = req.params.user_id;

    const result = await paymentService.getPaymentDetail(payment_id, user_id);
    

    res.json(result);

}

// 취소 상세 내역
export async function getCancelDetail(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    // const page = req.params.page;
    // const limit = req.params.limit;
    const cancel_id = req.params.cancel_id;
    const user_id = req.params.user_id;

    const result = await paymentService.getCancelDetail(cancel_id, user_id);

    res.json(result);

}

// 취소 반려 처리
export async function rejectCancelRequest(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    // const page = req.params.page;
    // const limit = req.params.limit;
    const cancel_id = req.params.cancel_id;
    const user_id = req.params.user_id;
    const cancel_status = req.query.cancel_status;

    const result = await paymentService.rejectCancelRequest(cancel_id, user_id, cancel_status);

    res.json(result);

}

// 전체환불 처리
export async function confirmCancelRequest(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    // const page = req.params.page;
    // const limit = req.params.limit;
    const cancel_id = req.params.cancel_id;
    const user_id = req.params.user_id;
    const cancel_status = req.query.cancel_status;

    const result = await paymentService.confirmCancelRequest(cancel_id, user_id, cancel_status);
    res.json(result);

}

// 취소 반려 + 환불 처리 
export async function processCancelRequest(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    // const page = req.params.page;
    // const limit = req.params.limit;
    const cancel_id = req.params.cancel_id;
    const user_id = req.params.user_id;
    const cancel_status = req.query.cancel_status;

    console.log(cancel_status);

    const result = await paymentService.processCancelRequest(cancel_id, user_id, cancel_status);

    res.json(result);

}