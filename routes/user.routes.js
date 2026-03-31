import express from 'express';
import * as userController from "../controllers/user.controller.js";

const router = express.Router();

router.get('/allList/:page/:limit', userController.getAllUsers); // 유저 전체 조회
router.get('/get/allCountry', userController.getAllCountry); // 전체 나라 조회
router.get('/find/:page/:limit', userController.findUser); // 유저 검색
router.get('/:user_id', userController.getUser); // 유저 상세조회

router.get('/ticket/:user_id', userController.getUserTicket); // 유저의 이용권 정보 조회(이용권 정보 버튼 클릭)
router.get('/ticket/history/:user_id/:page/:limit', userController.getUserTicketHistory); // 6.유저 이용권+쿠폰 히스토리 조회(해당 서비스의 이용권상세 버튼 클릭)
router.get('/assetsDetail/:user_id/:page/:limit', userController.getUserAssetsDetail); // 7.유저 이용권 및 쿠폰 상세 내역 조회(해당 서비스의 이용권상세 버튼 클릭)

router.post('/reset/password/:user_id', userController.resetPassword); // 비밀번호 초기화
router.post('/update/info/:user_id', userController.updateUserInfo); // 유저 정보 업데이트

// 프로모션 페이지 유저조회
router.get('/list/:page/:limit', userController.getUserList); // 쿠폰 생성페이지 회원 조회

export default router;