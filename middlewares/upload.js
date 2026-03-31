import multer from 'multer';
import path from 'path';
import fs from 'fs';
import iconv from 'iconv-lite';
import { toUtf8NameIfNeeded } from '../utils/toUtf8.js';
import { getAttachmentsPath, getEditorPath, getThumbnailsPath, getLogoPath } from '../utils/uploadPaths.js';

const ensureUploadDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// 파일시스템 저장용 안전한 파일명
function sanitizeBaseName(name) {
  return (name || '')
    .normalize('NFC')
    .replace(/\x00/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/* =========================
 * 첨부파일(일반) 저장소
 * ========================= */
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { type } = req.params; // manual, paper
    let uploadPath;
    if (file.fieldname === 'keepFileIds') {
      uploadPath = path.resolve('uploads/tmp');       // keepFileIds 파일은 임시 폴더
    } else {
      uploadPath = path.resolve(getAttachmentsPath(type));
    }
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const decodedName = toUtf8NameIfNeeded(file.originalname);
    const timestamp = Date.now();
    const ext = path.extname(decodedName) || '';
    const base = sanitizeBaseName(path.basename(decodedName, ext)) || 'file';
    cb(null, `${timestamp}_${base}${ext}`);
  }
});

/* =========================
 * 에디터 저장소/필터(변경 없음)
 * ========================= */
const editorStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { type } = req.params;
    const uploadPath = path.resolve(getEditorPath(type));
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const decodedName = toUtf8NameIfNeeded(file.originalname);
    const timestamp = Date.now();
    const ext = path.extname(decodedName);
    cb(null, `${timestamp}${ext}`);
  }
});

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
};

const editorFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
  else cb(null, false);
};

/* =========================
 * 썸네일 저장소(변경 없음)
 * ========================= */
const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(getThumbnailsPath('news'));
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const decodedName = toUtf8NameIfNeeded(file.originalname);
    const timestamp = Date.now();
    const ext = path.extname(decodedName);
    cb(null, `thumb_${timestamp}${ext}`);
  }
});

/* =========================
 * 로고 저장소(변경 없음)
 * ========================= */
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(getLogoPath());
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const decodedName = toUtf8NameIfNeeded(file.originalname);
    const timestamp = Date.now();
    const ext = path.extname(decodedName) || '';
    const base = sanitizeBaseName(path.basename(decodedName, ext)) || 'file';
    cb(null, `${timestamp}_${base}${ext}`);
  }
});

/* =========================
 * 일반 게시판 업로더 (file/files/keepFileIds 허용)
 * ========================= */
// 기존 .array('files',5) -> .fields(...) 로 변경해야 keepFileIds 파일을 같이 받을 수 있습니다.
export const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
}).fields([
  { name: 'files',       maxCount: 5 },   // 구 규약 호환
]);

/* =========================
 * 에디터/썸네일/로고 업로더 (변경 없음)
 * ========================= */
export const uploadEditor = multer({
  storage: editorStorage,
  fileFilter: editorFilter,
  limits: { fileSize: 200 * 1024 * 1024 }
}).single('image');

export const uploadThumbnail = multer({
  storage: thumbnailStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('thumbnail');

export const uploadLogoImage = multer({
  storage: logoStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('logo_image');

/* =========================
 * news 통합 저장소/업로더
 * ========================= */
const combinedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { type } = req.params; // news
    let uploadPath;
    if (file.fieldname === 'thumbnail') {
      uploadPath = path.resolve(getThumbnailsPath(type));
    } else if (file.fieldname === 'keepFileIds') {
      uploadPath = path.resolve('uploads/tmp');
    } else {
      uploadPath = path.resolve(getAttachmentsPath(type));
    }
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const decodedName = toUtf8NameIfNeeded(file.originalname);
    const timestamp = Date.now();
    const ext = path.extname(decodedName);
    const baseName = sanitizeBaseName(path.basename(decodedName, ext)) || 'file';
    if (file.fieldname === 'thumbnail') cb(null, `thumb_${timestamp}${ext}`);
    else cb(null, `${timestamp}_${baseName}${ext}`);
  }
});

export const uploadCombined = multer({ 
  storage: combinedStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 썸네일은 이미지만 허용, 그 외는 모두 허용
    if (file.fieldname === 'thumbnail') {
      return file.mimetype.startsWith('image/')
        ? cb(null, true)
        : cb(new Error('썸네일은 이미지 파일만 업로드 가능합니다.'), false);
    }
    cb(null, true);
  }
}).fields([
  { name: 'thumbnail',   maxCount: 1 },
  { name: 'files',       maxCount: 5 },  // 구 규약 호환
]);


