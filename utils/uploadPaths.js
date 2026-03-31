/**
 * 업로드 경로 관리 유틸리티
 * 환경변수를 기반으로 업로드 경로를 반환
 */

/**
 * 기본 업로드 경로 반환
 * @returns {string} 기본 업로드 경로
 */
export function getUploadBasePath() {
  return process.env.UPLOAD_BASE_PATH || 'uploads';
}

/**
 * 첨부파일 경로 반환
 * @param {string} type - 게시판 타입 (manual, paper, news)
 * @returns {string} 첨부파일 경로
 */
export function getAttachmentsPath(type) {
  const basePath = getUploadBasePath();
  return `${basePath}/attachments/${type}`;
}

/**
 * 에디터 업로드 경로 반환
 * @param {string} type - 게시판 타입 (manual, paper, news)
 * @returns {string} 에디터 경로
 */
export function getEditorPath(type) {
  const basePath = getUploadBasePath();
  return `${basePath}/editor/${type}`;
}

/**
 * 썸네일 경로 반환
 * @param {string} type - 게시판 타입 (기본: news)
 * @returns {string} 썸네일 경로
 */
export function getThumbnailsPath(type = 'news') {
  const basePath = getUploadBasePath();
  return `${basePath}/thumbnails/${type}`;
}

/**
 * 로고 이미지 경로 반환
 * @returns {string} 로고 경로
 */
export function getLogoPath() {
  const basePath = getUploadBasePath();
  return `${basePath}/logo_image`;
}

/**
 * 임시 파일 경로 반환
 * @returns {string} 임시 파일 경로
 */
export function getTempPath() {
  return process.env.UPLOAD_TEMP_PATH || 'uploads/temp';
}

/**
 * 파일 URL 생성 (웹에서 접근 가능한 경로)
 * @param {string} type - 파일 타입 (attachments, editor, thumbnails, logo)
 * @param {string} boardType - 게시판 타입 (manual, paper, news)
 * @param {string} filename - 파일명
 * @returns {string} 웹 접근 가능한 URL
 */
export function createFileUrl(type, boardType, filename) {
  const basePath = getUploadBasePath();
  
  // 경로가 절대 경로면 상대 URL로 변환
  const urlBasePath = basePath.startsWith('/') ? '/uploads' : '/uploads';
  
  switch (type) {
    case 'attachments':
      return `${urlBasePath}/attachments/${boardType}/${filename}`;
    case 'editor':
      return `${urlBasePath}/editor/${boardType}/${filename}`;
    case 'thumbnails':
      return `${urlBasePath}/thumbnails/${boardType}/${filename}`;
    case 'logo':
      return `${urlBasePath}${filename}`;
    default:
      return `${urlBasePath}/${filename}`;
  }
}

/**
 * 환경 정보 출력 (디버깅용)
 */
export function printUploadConfig() {
  console.log('📁 업로드 경로 설정:');
  console.log(`  기본 경로: ${getUploadBasePath()}`);
  console.log(`  첨부파일: ${process.env.UPLOAD_ATTACHMENTS_PATH}`);
  console.log(`  에디터: ${process.env.UPLOAD_EDITOR_PATH}`);
  console.log(`  썸네일: ${process.env.UPLOAD_THUMBNAILS_PATH}`);
  console.log(`  로고: ${process.env.UPLOAD_LOGO_PATH}`);
  console.log(`  임시: ${process.env.UPLOAD_TEMP_PATH}`);
}