import * as questionsService from '../services/questions.service.js';

// 문의 조회
export async function getList(req, res) {
  console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
  // 조건들
  // 등록기간, 답변대기, 답변완료
  const page = req.params.page;
  const limit = req.params.limit;
  const info = req.query;
  const result = await questionsService.getList(page, limit, info);

  res.json(result);

}

export async function getDetail(req, res) {
  console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`)
  // 조건들
  // 등록기간, 답변대기, 답변완료
  const user_id = req.params.user_idx;
  const question_id = req.params.question_idx;
  
  const result = await questionsService.getDetail(user_id, question_id);

  res.json(result);

}
