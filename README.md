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

### 7. 요금관리 수정규칙
수정 규칙(검증)

비활성 서비스(servicedefinition.is_active=false)는 수정 불가 → 403
활성 상태에서 price/duration/name(서비스명)/display_title 등 필드는 빈값/NULL 불가

수정 불가 필드
서비스: service_id, logo_name(서버에서 자동), updated_at(검증용으로만 수신)

플랜: type, name, (영구권) price=0, duration=99999는 변경 금지

### 8. 로고 처리
keep_logo=true: 현 상태 유지
keep_logo=false + 파일 미첨부: 기존 로고 삭제

### 9. 파일, 로고, 에디터, 첨부파일 등등 PATH 설정
/var/www/admin/uploads 환경변수 참조 : 물리적 위치로 저장, 삭제 
... ainsight-admin-backend/uploads 보여주거나 DB저장, 다운로드 : /upload...






### 10. 통계관리 


  필요한 주요 테이블들:

  1. users 테이블

  - 회원 정보 (국내/국외, 일반의/교정의/기타 구분)
  - user_type 컬럼 필요 (1:국내전체, 2:일반의, 3:교정의, 4:기타, 5:국외)

  2. services 테이블 (admin_panel_servicedefinition)

  - 서비스 유형 (AICiTi, AIModel, AIsoft, AIplan, AIsetup, AIsimulation)

  3. ticket_types 테이블 ( public.admin_panel_pricingplan 에서 찾아와야할듯 )

  - 이용권 유형 (1년이용권, 1회이용권, 쿠폰이용권 )
   

  4. purchases 테이블 (테넌트들 돌면서 - payments_userassetshistory 돌아얄듯)

  - 구매 정보
  - payments_userassetshistory.action_type 사용유무 
  - payments_userassetshistory.pricing_plan_id 은 admin_panel_pricingplan에서 id(pk)
  - 관계: user_id, service_id, ticket_type_id, price, purchase_date
  - 쿠폰의 경우 granted_count로 구분

  5. payments 결제 테이블 (테넌트- payments_userassets 돌아얄듯) (테넌트들 돌면서 payments_payment, payments_paymentcancellation 으로 구매한거랑 구매취소한거랑 계산해서 집계해야할 것 같아)

  - 결제 정보
  - payment_method, amount, payment_date

  6. usage_logs 테이블

  - 이용 내역 (1회이용권/쿠폰 사용)  - payments_userassetshistory.action_type 사용유무 
  - payments_userassetshistory.pricing_plan_id 은 admin_panel_pricingplan에서 id(pk)
  - user_id, service_id, tieket, used_at

  7. daily_statistics 테이블

  - 일별 통계 캐시
  - date, total_price, new_users

  기존 AdminPanelServiceDefinition과 AdminPanelPricingPlan은 services와 ticket_types 역할을 할 수 있지만, 통계용으로는 별도 테이블이 더 적합할 것 같습니다.

  엔티티 수정/추가 필요사항:
  1. User 엔티티에 user_type 컬럼 추가
  2. TicketType, Purchase, Payment, UsageLog, DailyStatistic 엔티티 신규 생성
  3. Service 엔티티 (기존 ServiceDefinition 활용 또는 새로 생성)
