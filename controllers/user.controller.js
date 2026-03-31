import * as userService from '../services/user.service.js';

// 유저 전체 조회
export async function getAllUsers(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const page = req.params.page;
    const limit = req.params.limit;

    const result = await userService.getAllUsers(page, limit);

    res.json(result);

}

// 전체 나라 조회
export async function getAllCountry(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const info = req.query;
    const result = await userService.getAllCountry(info);

    res.json(result);

}

// 유저 검색
export async function findUser(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    const result = await userService.findUser(info, page, limit);

    res.json(result);

}

// 유저 상세 조회
export async function getUser(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;
    const result = await userService.getUser(user_id);

    res.json(result);

}

// 유저의 이용권 정보 조회(이용권 정보 버튼 클릭)
export async function getUserTicket(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;
    
    const result = await userService.getUserTicket(user_id);

    res.json(result);

}

// 유저 이용권 히스토리(내역) 조회
export async function getUserTicketHistory(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);

    const user_id = req.params.user_id;
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;
    
    const result = await userService.getUserTicketHistory(user_id, page, limit, info);

    res.json(result);
}

// 유저 이용권 상세 내역 조회
export async function getUserTicketDetail(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    info.type = '1'
    //const result = await userService.getUserTicketDetail(user_id, page, limit, info);
    const result = await userService.getUserAssetsDetail(user_id, page, limit, info);

    res.json(result);

}

// 유저 쿠폰 내역 조회
export async function getUserCouponDetail(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    info.type = '0'
    //const result = await userService.getUserCouponDetail(user_id, page, limit);
    const result = await userService.getUserAssetsDetail(user_id, page, limit, info);

    res.json(result);

}

// 유저 이용권 및 쿠폰 상세 내역 조회
export async function getUserAssetsDetail(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    console.log("info == ", info);

    const result = await userService.getUserAssetsDetail(user_id, page, limit, info);

    res.json(result);

}

// 비밀번호 초기화
export async function resetPassword(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;

    const result = await userService.resetPassword(user_id);

    res.json(result);

}

// 회원 정보 업데이트
export async function updateUserInfo(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const user_id = req.params.user_id;
    const info = req.body;

    const result = await userService.updateUserInfo(user_id, info);

    res.json(result);

}

// 쿠폰 지급할 회원 조회 in 프로모션 페이지
export async function getUserList(req, res) {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
    const page = req.params.page;
    const limit = req.params.limit;
    const info = req.query;

    const result = await userService.getUserList(page, limit, info);

    res.json(result);

}