import express from 'express';
import * as questionsController from "../controllers/questions.controller.js";

const router = express.Router();

router.get('/list/:page/:limit', questionsController.getList); // 모든 문의사항 조회
router.get('/detail/:user_idx/:question_idx', questionsController.getDetail); // 문의 세부사항


export default router;