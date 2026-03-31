import express from 'express';
import * as adminController from "../controllers/admin.controller.js";
//게시판 파일업로드(multer 미들웨어)
import { uploadEditor, uploadCombined, uploadAttachment, uploadLogoImage } from '../middlewares/upload.js';
// 에디터 파일 정리 직접 import
import multer from 'multer';
import { cleanupEditorFiles } from '../utils/editorCleanup.js';

const router = express.Router();

router.post('/signup', adminController.signup); // 회원가입
router.post('/login', adminController.login); // 로그인
router.get('/mypage', adminController.getAdmin); // 관리자조회
router.post('/reset/password', adminController.resetPassword); // 비밀번호 초기화
router.put('/update/info', adminController.updateAdminInfo); // 관리자 데이터 수정


/*
  게시글 설정
  - ✅ multer: body파싱(form-data, json 모두) + diskStorage + .fields() 
*/

// 목록 조회 api/admin/posts/manual?page=1&limit=5&title=검색어
router.get('/posts/:type', adminController.getPosts);

// 상세 조회
router.get('/posts/:type/:id', adminController.getPost);

// 게시글 등록 - 게시판 타입별로 다른 업로드 처리
router.post('/posts/:type', (req, res, next) => {
  const { type } = req.params;

  // ✅ 1) 에러 핸들러를 먼저 선언 (호이스팅 이슈 방지)
  const handleErr = (err) => {
    if (!err) return next(); // 업로드 성공 → 다음 미들웨어(컨트롤러)로

    console.error('❌ 업로드 에러:', err);

    // ✅ 2) Multer 시스템 에러 (필드/용량 등)
    if (err instanceof multer.MulterError) {
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          // 필드별 안내 문구 분기(옵션)
          return res.status(413).json({
            success: false,
            message:
              err.field === 'thumbnail'
                ? '썸네일은 최대 5MB까지 업로드 가능합니다.'
                : '첨부파일은 최대 50MB까지 업로드 가능합니다.'
          });

        case 'LIMIT_UNEXPECTED_FILE':
          return res.status(400).json({
            success: false,
            message: "허용되지 않는 필드이거나 파일입니다."
          });

        default:
          return res.status(400).json({
            success: false,
            message: '업로드 형식이 올바르지 않습니다.'
          });
      }
    }

    // ✅ 3) fileFilter에서 던진 커스텀 에러
    // (예: 썸네일에 이미지 아닌 파일 → '이미지 파일만 넣어주세요' 등)
    return res.status(400).json({
      success: false,
      message: err.message || '업로드 실패'
    });
  };

  // ✅ 4) 업로드 실행 (에러는 handleErr로 전달)
  if (type === 'news') {
    console.log('소식 게시판 - uploadCombined 호출');
    uploadCombined(req, res, handleErr);
  } else {
    console.log('일반 게시판 - uploadAttachment 호출');
    uploadAttachment(req, res, handleErr);
  }
}, adminController.createPost);

// 게시글 수정 (부분 수정)
router.patch('/posts/:type/:id', (req, res, next) => {
  const { type } = req.params;
  
  const handleErr = (err) => {
    if (!err) return next();
    console.error('수정 업로드 에러:', err);

    // 파일 개수/필드 오류
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      if (['file', 'files'].includes(err.field)) {
        return res.status(400).json({
          success: false,
          message: '첨부파일은 최대 5개까지만 업로드 가능합니다.'
        });
      }
      if (err.field === 'thumbnail') {
        return res.status(400).json({
          success: false,
          message: '썸네일은 1개만 업로드 가능합니다.'
        });
      }
      if (err.field === 'keepFileIds') {
        return res.status(400).json({
          success: false,
          message: 'keepFileIds 파일은 5개만 업로드 가능합니다.'
        });
      }
    }
    return res.status(400).json({ success: false, message: err.message });
  };

  if (type === 'news') {
    uploadCombined(req, res, handleErr);
  } else {
    uploadAttachment(req, res, handleErr);
  }
}, adminController.updatePost);

// 게시글 삭제
router.delete('/posts/:type/:id', adminController.deletePost);

// 에디터 이미지/동영상 업로드
router.post('/posts/:type/editor/upload', uploadEditor, adminController.uploadEditorFile);

// 첨부파일 삭제
router.delete('/posts/:type/:postId/files/:files_id', adminController.deleteAttachment);

// 썸네일 삭제 (news 게시판 전용)
router.delete('/posts/:type/:id/thumbnail', adminController.deleteThumbnail);

// 수동 에디터 파일 정리 (개발/테스트용)
router.post('/cleanup/editor', async (req, res) => {
  try {
    const stats = await cleanupEditorFiles();
    res.json({
      message: "에디터 파일 정리 완료",
      stats: stats
    });
  } catch (error) {
    console.error('수동 정리 오류:', error);
    res.status(500).json({ 
      message: "에디터 파일 정리 실패",
      error: error.message
    });
  }
});

// 첨부파일 다운로드
router.get('/download/:type/:postId/:fileId', adminController.downloadFile);


// ========== 💰 요금관리 기능 💰 ==========

// 1. 요금설정 조회
// GET /api/admin/pricing?service_id=1 (특정 서비스)
// 1. 요금설정 조회 - GET /api/admin/pricing/:serviceId (특정 서비스)
router.get('/pricing', adminController.getPricingSettings);

// 2. 요금설정 수정 - PATCH /api/admin/pricing/:serviceId (로고 파일 업로드 포함)
router.patch('/pricing/:serviceId', uploadLogoImage, adminController.updatePricingSettings);

// 3. 개별 플랜 수정 - PATCH /api/admin/pricing/plan/:plan_id (구체적인 라우트를 먼저 배치)
router.patch('/pricing/plan/:plan_id', adminController.updateSinglePlan);

// 4. 서비스 활성화/비활성화 토글 - POST /api/admin/pricing/toggleService
router.post('/pricing/toggleService', adminController.toggleService);

// 5. 플랜 활성화/비활성화 토글 - POST /api/admin/pricing/togglePlan
router.post('/pricing/togglePlan', adminController.togglePlan);






export default router;