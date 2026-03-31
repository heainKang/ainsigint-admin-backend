# Ainsight Admin Backend

관리자용 게시판/요금 관리 시스템 백엔드 API

## 🚀 시작하기

### 환경 요구사항
- Node.js 18+
- PostgreSQL 13+
- npm


## 🔧 기술 스택
- **Backend**: Node.js + Express
- **Database**: PostgreSQL + TypeORM
- **File Upload**: Multer
- **Testing**: Postman
- **CI/CD**: GitHub Actions

## 📝 개발 가이드

### 환경 설정
- 시간대: Asia/Seoul (UTC+9)
- 문자 인코딩: UTF-8
- 파일 업로드 제한: 200MB / 썸네일 5 / 로고 10이였나..

### 환경 변수 기반 파일 경로 설정

## 🔄 파일 업로드 로직 구조

### 1. 환경별 경로 관리
- **utils/uploadPaths.js**: 환경변수 기반 경로 생성 유틸리티
- **createFileUrl()**: 파일 URL 생성 (상대경로)
- **getAttachmentsPath()**: 첨부파일 저장 경로
- **getEditorPath()**: 에디터 파일 저장 경로
- **getThumbnailsPath()**: 썸네일 저장 경로

### 2. Multer 미들웨어 구조
- **attachmentStorage**: 일반 첨부파일용 (manual, paper)
- **combinedStorage**: 통합 업로드용 (news - 첨부파일 + 썸네일)
- **editorStorage**: 에디터 이미지/동영상용
- **thumbnailStorage**: 썸네일 전용

### 3. 게시판별 업로드 처리
#### 일반 게시판 (manual, paper)
- **미들웨어**: uploadAttachment (.fields 방식)
- **지원 필드**: files (최대 5개)
- **저장 위치**: uploads/attachments/{type}/

#### 소식 게시판 (news)
- **미들웨어**: uploadCombined (.fields 방식)
- **지원 필드**: files (최대 5개), thumbnail (최대 1개)
- **저장 위치**: 
  - 첨부파일: uploads/attachments/news/
  - 썸네일: uploads/thumbnails/news/

#### 에디터 업로드
- **미들웨어**: uploadEditor (.single 방식)
- **지원 파일**: 이미지, 동영상
- **저장 위치**: uploads/editor/{type}/

#### 로고 업로드
- **미들웨어**:  (.single 방식)
- **지원 파일**: 이미지,
- **저장 위치**: uploads

### 4. 파일 관리 기능
#### keepFileIds 로직 (게시글 수정 시)
```javascript
// 기존 파일 중 유지할 파일 ID 목록
const keepFileIds = req.body.keepFileIds ? 
  req.body.keepFileIds.split(',').map(id => parseInt(id)) : [];

// 유지할 파일과 삭제할 파일 분리
const filesToKeep = existingFiles.filter(file => keepFileIds.includes(file.id));
const filesToDelete = existingFiles.filter(file => !keepFileIds.includes(file.id));
```

#### 자동 파일 정리 (editorCleanup.js)
- **실행 시점**: 서버 시작 3초 후 자동 실행
- **정리 대상**: DB에서 참조되지 않는 에디터 파일들
- **수동 실행**: POST /api/admin/cleanup/editor

#### 파일 다운로드 (한글 파일명 지원)
```javascript
// RFC 5987 표준 인코딩
const encodedFilename = encodeURIComponent(originalName);
res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
```

### 5. URL 정규화 로직
```javascript
// 에디터 내용의 절대 URL을 상대 URL로 변환
function normalizeUploadsInHtml(htmlContent) {
  return htmlContent.replace(
    /src="[^"]*\/uploads\//g, 
    'src="/uploads/'
  );
}
```

### 6. 파일 저장 구조
```
타임스탬프_파일명.확장자 / 파일, 로고
예: 1755744239405_스크린샷 2025-08-21 오전 10.32.48.png

썸네일: thumb_타임스탬프.확장자 / 썸네일, 에디터
예: thumb_1755744239405.png
```

### 8. 로고, 섬네일 처리
keep_logo=true: 현 상태 유지
keep_logo=false + 파일 미첨부: 기존 로고 삭제

### 9. 파일, 로고, 에디터, 첨부파일 등등 PATH 설정
/var/www/admin/uploads 환경변수 참조 : 물리적 위치로 저장, 삭제 
... ainsight-admin-backend/uploads 보여주거나 DB저장, 다운로드 : /upload...

