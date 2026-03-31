import * as adminService from '../services/admin.service.js';
import * as adminRepo from '../repositories/admin.repository.js';
import { AppDataSource_admin } from '../config/data-sources_admin.js';
import { ManualPost } from '../models/posts/manualPost.entity.js';
import { PaperPost } from '../models/posts/paperPost.entity.js';
import { NewsPost } from '../models/posts/newsPost.entity.js';
import { PostFile } from '../models/posts/postFile.entity.js';
import { deleteEditorImages } from '../utils/editorImageUtil.js';
import { toJsonWithStringNumbers } from '../utils/jsonResponseUtil.js';
import { toUtf8NameIfNeeded, normalizeUploadsInHtml } from '../utils/toUtf8.js';
import { createFileUrl, getUploadBasePath } from '../utils/uploadPaths.js';
import { Like } from 'typeorm';
import fs from 'fs';
import path from 'path';
import { isConditionalExpression } from 'typescript';

// 사용자 등록
export async function signup(req, res) {
    try {
        console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
       
        const info = req.body;
        const result = await adminService.signup(info);
        console.log(result);
        
        res.json(result);
    } catch (error) {
        console.log(error);
    }
}

// 관리자 로그인
export async function login(req, res) {
    try {
        console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
        
        const info = req.body;
        console.log("info == ", info);
        // info = {
        //     "email",
        //     "password"
        // }
        const result = await adminService.login(info);


        // console.log(`** ${req.method} ${req.originalUrl} 응답 ====>`, result.status);

        console.log(result);
        res.json(result);
    } catch(error) {
        console.error("로그인 에러:", error);
        return res.status(500).json({ message: "서버 에러" });
    }
}

// 관리자 비밀번호 초기화
export async function resetPassword(req, res) {
    try {
        console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
        
        const result = await adminService.resetPassword();
        res.json(result);
    } catch(error) {
        console.error("로그인 에러:", error);
        return res.status(500).json({ message: "서버 에러" });
    }
}

// 관리자 조회
export async function getAdmin(req, res) {
    try {
        console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
       
        const info = req.query;
        const result = await adminRepo.find(info);
        const returnData = {
          id: result.id,
          email: result.email,
          contact: result.contact
        }
        
        res.json(returnData);
    } catch (error) {
        console.log(error);
    }
}

// 관리자 내용 수정
export async function updateAdminInfo(req, res) {
  try {
      console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
      const info = req.body;
      
      const result = await adminService.updateAdminInfo(info);
      res.json(result);

  } catch(error) {
      console.error("로그인 에러:", error);
      return res.status(500).json({ message: "서버 에러" });
  }
}


// ========== 🗂️ 게시판 관리 기능 🗂️ ==========

// 게시판 엔티티 매핑
const getEntityByType = (type) => {
  switch (type) {
    case 'manual': return ManualPost;
    case 'paper': return PaperPost;
    case 'news': return NewsPost;
    default: throw new Error('없는 게시판 type 입니다.');
  }
};

// 목록 조회 (페이징, 검색, 정렬) - admin 테이블과 조인
export async function getPosts(req, res) {
  try {
    const { type } = req.params;
    const { page = 1, limit = 5, title = '' } = req.query;
    
    const Entity = getEntityByType(type);
    const result = await adminRepo.findPostsWithPagination(Entity, { 
      page, 
      limit, 
      title, 
      type 
    });
    
    toJsonWithStringNumbers(res, result);

  } catch (error) {
    console.error('목록 조회 오류:', error);
    res.status(500).json({ success: false, message: '목록 조회에 실패했습니다.' });
  }
}

// 상세 조회
export async function getPost(req, res) {
  try {
    const { type, id } = req.params;
    const Entity = getEntityByType(type);
    
    // Repository 함수 사용
    const post = await adminRepo.findPostById(Entity, id, type);
    
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 첨부파일 조회
    const files = await adminRepo.findFilesByPost(type, id);
  
    console.log('=== 📄 상세 조회 - 게시글 정보 ===');
    console.log('게시글 ID:', id);
    console.log('게시판 타입:', type);
    console.log('썸네일 URL:', post.thumbnail_url);
    console.log('썸네일 원본명:', post.thumbnail_original_name);
    console.log('첨부파일 개수:', files.length);
  
    // 응답 데이터 구성
    const responseData = {
      ...post,
      id: String(post.id),
      //reference: post.reference || '-', // null인 경우 '-'로 표시
      thumbnail_url: post.thumbnail_url || null,
      thumbnail_original_name: post.thumbnail_original_name || null,
      files: files.map(file => ({
        id: file.id,
        original_filename: file.original_filename,
        saved_filename: file.saved_filename,
        file_url: file.file_url,
        size: file.size,
        mimetype: file.mimetype,
      }))
    };
    
    res.json(responseData);

  } catch (error) {
    console.error('상세 조회 오류:', error);
    res.status(500).json({ success: false, message: '상세 조회에 실패했습니다.' });
  }
}


// 게시글 등록
export async function createPost(req, res) {
  try {
    console.log('=== 게시글 등록 시작 ===');

    const { type } = req.params;
    const { title, content, created_by = '관리자', reference } = req.body;
    
    // ==== 유효성 검사 ===== //
    // 제목 검증
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: '제목이 필요합니다.' });
    }
    if (title.trim().length > 255) {
      return res.status(400).json({ success: false, message: '제목은 255자를 초과할 수 없습니다.' });
    }
    
    // 내용 검증 및 정규화 - 이미지 포함 콘텐츠를 고려한 제한
    let validContent = content ? content : '';
    
    // 에디터 업로드 URL 정규화 (절대 URL → 상대 URL)
    validContent = normalizeUploadsInHtml(validContent);
    
    if (Buffer.byteLength(validContent, "utf8") > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "본문 내용이 너무 깁니다. 최대 50MB까지 입력 가능합니다."
      });
    }
    
    // 작성자 검증
    const validCreatedBy = (created_by && created_by.trim() !== '') ? created_by.trim() : '관리자';
    if (validCreatedBy.length > 100) {
      return res.status(400).json({ success: false, message: '작성자명은 100자를 초과할 수 없습니다.' });
    }
    
    // reference 출처 검증
    const validReference = (reference && reference.trim() !== '') ? reference.trim().substring(0, 255) : null;
    // ==== 유효성 검사 ===== //

    const Entity = getEntityByType(type);
    const repository = AppDataSource_admin.getRepository(Entity);
    const fileRepository = AppDataSource_admin.getRepository(PostFile);
    
    // 게시글 생성 (검증된 값 사용)
    const postData = { title: title.trim(), content: validContent, created_by: validCreatedBy };
    if (validReference) {
      postData.reference = validReference;
    }
    
    // 1. 소식 게시판의 경우 썸네일 처리 - null/undefined 체크 강화
    if (type === 'news') {
      if (req.files && req.files.thumbnail && Array.isArray(req.files.thumbnail) && req.files.thumbnail.length > 0) {
        const thumbnailFile = req.files.thumbnail[0];
        if (thumbnailFile && thumbnailFile.filename && typeof thumbnailFile.filename === 'string') {
          //저장 경로
          postData.thumbnail_url = createFileUrl('thumbnails', 'news', thumbnailFile.filename);
          postData.thumbnail_original_name = toUtf8NameIfNeeded(thumbnailFile.originalname);
          console.log(" 📝 들어가는 코드 thumbnail_original_name : ", thumbnailFile.originalname);
          console.log(" 📝 변환된 thumbnail_original_name : ", toUtf8NameIfNeeded(thumbnailFile.originalname));
          //postData.thumbnail_original_name = thumbnailFile.originalname;
        } else {
          console.log('⚠️ 썸네일 파일명이 유효하지 않습니다.');
        }
      } else {
        console.log('📝 썸네일 없음 (소식 게시판)');
      }
    }
    
    // 2. 게시글 저장
    const post = repository.create(postData);
    const savedPost = await repository.save(post);
    
    // 3. 첨부파일 저장 
    console.log("=== 📁 등록 - 파일 업로드 상세 정보 ===");
    console.log("req.files 전체:", req.files);
    console.log("req.files 타입:", typeof req.files);
    console.log("req.files 키:", req.files ? Object.keys(req.files) : '없음');
    
    if (req.files) {
      console.log("req.files.files:", req.files.files);
      console.log("req.files.thumbnail:", req.files.thumbnail);
      
      if (req.files.files) {
        console.log("files 배열 길이:", req.files.files.length);
        req.files.files.forEach((file, index) => {
          console.log(`files[${index}]:`, {
            originalname: file.originalname,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
          });
        });
      }
      
      if (req.files.thumbnail) {
        console.log("thumbnail 배열 길이:", req.files.thumbnail.length);
        req.files.thumbnail.forEach((file, index) => {
          console.log(`thumbnail[${index}]:`, {
            originalname: file.originalname,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
          });
        });
      }
    }

    // uploadCombined (news) vs uploadAttachment (manual, paper) 처리
    let filesToProcess = [];
    
    // 모든 게시판에서 req.files.files 구조 사용 (upload.js가 .fields()로 변경됨)
    if (req.files && req.files.files) {
      filesToProcess = req.files.files;
      console.log(`📁 ${type} 게시판 - files 처리:`, filesToProcess.length, "개");
    }
    
    console.log("최종 처리할 filesToProcess:", filesToProcess.length, "개");

    if (filesToProcess.length > 0) {
      const filePromises = filesToProcess.map(file => {
        let safeOriginalName = toUtf8NameIfNeeded(file.originalname); // 사람에게 보여줄 원본명
          if (!safeOriginalName) {
            const ext = path.extname(file.originalname) || '';
            safeOriginalName = `file${ext}`;
        }
        
        const fileData = {
          type: type,
          post_id: savedPost.id,
          original_filename: safeOriginalName,
          saved_filename: toUtf8NameIfNeeded(file.filename),
          file_url: createFileUrl('attachments', type, toUtf8NameIfNeeded(file.filename)),
          size: file.size,
          mimetype: file.mimetype
        };
        return fileRepository.save(fileRepository.create(fileData));  //파일DB저장
      });
      await Promise.all(filePromises);  //확인필요
      console.log(`✅ ${filesToProcess.length}개 파일 DB 저장 완료`);
    } else {
      console.log("📝 첨부파일 없음");
    }
    
    const response = {
      id: savedPost.id,
      message: "게시글 등록 완료"
    };
    
    // 소식 게시판의 경우 thumbnail_url 포함
    if (type === 'news' && savedPost.thumbnail_url) {
      response.thumbnail_url = savedPost.thumbnail_url;
      response.thumbnail_original_name = savedPost.thumbnail_original_name;
    }
    
    res.status(201).json(response);
  } catch (error) {
    console.error('게시글 등록 오류:', error);
    res.status(500).json({ success: false, message: '게시글 등록에 실패했습니다.' });
  }
}


/**
 * 게시글 수정 API (트랜잭션 기반 안전한 파일 관리)
 * 
 * 주요 기능:
 * 1. 기존 파일과 새 파일을 안전하게 관리
 * 2. 프론트에서 "유지할 파일 목록"을 받아서 나머지는 삭제
 * 3. 모든 작업을 트랜잭션으로 처리하여 데이터 일관성 보장
 * 4. 상세한 수정 내역 추적 및 로깅
 */
export async function updatePost(req, res) {
  try {
    // ==================== 1. 요청 데이터 추출 ====================
    const { type, id } = req.params; // URL에서 게시판타입, 게시글ID 추출
    const { 
      title,           // 수정할 제목 (optional)
      content,         // 수정할 내용 (optional) 
      created_by,      // 수정할 작성자 (optional)
      reference,       // 수정할 출처 (optional, paper 게시판만)
      keepFileIds,     // 🎯 핵심: 유지할 첨부파일 ID 목록 (JSON 문자열 또는 배열)
      keepThumbnail    // 썸네일 유지 여부 ('true'/'false' 문자열 또는 boolean, news만)
    } = req.body;
    
    console.log('=== 📝 수정 - 기본 정보 ===');
    console.log('게시판 타입:', type);
    console.log('게시글 ID:', id);
    console.log('제목 수정:', title ? '있음' : '없음');
    console.log('내용 수정:', content !== undefined ? '있음' : '없음');
    console.log('작성자 수정:', created_by !== undefined ? '있음' : '없음');
    console.log('출처 수정:', reference !== undefined ? '있음' : '없음');
    
    console.log('=== 📁 수정 - 파일 관리 정보 ===');
    console.log('keepFileIds 원본:', keepFileIds);
    console.log('keepThumbnail 원본:', keepThumbnail);
    
    console.log('=== 📁 수정 - 새 파일 업로드 정보 ===');
    console.log("req.files 전체:", req.files);
    console.log("req.files 타입:", typeof req.files);
    console.log("req.files 키:", req.files ? Object.keys(req.files) : '없음');
    
    if (req.files) {
      console.log("req.files.files:", req.files.files);
      console.log("req.files.thumbnail:", req.files.thumbnail);
      
      if (req.files.files) {
        console.log("새 files 배열 길이:", req.files.files.length);
        req.files.files.forEach((file, index) => {
          console.log(`새 files[${index}]:`, {
            originalname: file.originalname,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
          });
        });
      }
      
      if (req.files.thumbnail) {
        console.log("새 thumbnail 배열 길이:", req.files.thumbnail.length);
        req.files.thumbnail.forEach((file, index) => {
          console.log(`새 thumbnail[${index}]:`, {
            originalname: file.originalname,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
          });
        });
      }
    }
    
    // keepFileIds 파싱 및 검증
    let keepFileIdArray = null; // null = omit (전부 유지)
    if (keepFileIds !== undefined) {
      try {
        keepFileIdArray = typeof keepFileIds === 'string' ? 
          JSON.parse(keepFileIds) : keepFileIds;
        
        if (!Array.isArray(keepFileIdArray)) {
          return res.status(400).json({ success: false, message: 'keepFileIds는 배열이어야 합니다.' });
        }
        
        // 정수 배열로 변환 및 검증
        keepFileIdArray = keepFileIdArray.map(Number).filter(Number.isInteger);
        console.log('✅ keepFileIds 파싱 성공:', keepFileIdArray);
      } catch (e) {
        console.error('❌ keepFileIds 파싱 오류:', e);
        return res.status(400).json({ success: false, message: 'keepFileIds 형식이 올바르지 않습니다.' });
      }
    } else {
      console.log('📝 keepFileIds 없음 - 기존 파일 그대로 유지');
    }
    
    // keepThumbnail 파싱 (문자열로 받은 경우 boolean 변환)
    const shouldKeepThumbnail = keepThumbnail === true || keepThumbnail === 'true';
    console.log('썸네일 유지 여부:', shouldKeepThumbnail, '(원본:', keepThumbnail, ')');
    
    const Entity = getEntityByType(type);
    const repository = AppDataSource_admin.getRepository(Entity);
    const fileRepository = AppDataSource_admin.getRepository(PostFile);
    
    const post = await repository.findOne({ where: { id: parseInt(id) } });
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    
    // 현재 첨부파일 목록 조회
    const currentFiles = await fileRepository.find({
      where: { post_id: parseInt(id), type },
      order: { id: 'ASC' }
    });
    console.log('📁 현재 첨부파일:', currentFiles.length, '개');
    console.log('📁 현재 파일 IDs:', currentFiles.map(f => f.id));
    
    // 업데이트 데이터 객체 (선택적 필드 업데이트)
    const updateData = {};
    
    // ==== 개별 필드 선택적 업데이트 ===== //
    // 제목이 제공된 경우만 검증 및 업데이트
    if (title !== undefined) {
      if (!title || title.trim() === '') {
        return res.status(400).json({ success: false, message: '제목이 필요합니다.' });
      }
      if (title.trim().length > 255) {
        return res.status(400).json({ success: false, message: '제목은 255자를 초과할 수 없습니다.' });
      }
      updateData.title = title.trim();
    }
    
    // 내용이 제공된 경우만 검증 및 업데이트
    if (content !== undefined) {
      let validContent = content ? content : '';
      
      // 에디터 업로드 URL 정규화 (절대 URL → 상대 URL)
      validContent = normalizeUploadsInHtml(validContent);
      
      if (Buffer.byteLength(validContent, "utf8") > 50 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "본문 내용이 너무 깁니다. 최대 50MB까지 입력 가능합니다."
        });
      }
      updateData.content = validContent;
    }
    
    // 작성자가 제공된 경우만 검증 및 업데이트
    if (created_by !== undefined) {
      const validCreatedBy = (created_by && created_by.trim() !== '') ? created_by.trim() : '관리자';
      if (validCreatedBy.length > 100) {
        return res.status(400).json({ success: false, message: '작성자명은 100자를 초과할 수 없습니다.' });
      }
      updateData.created_by = validCreatedBy;
    }
    
    // 출처가 제공된 경우만 검증 및 업데이트
    if (reference !== undefined) {
      const validReference = (reference && reference.trim() !== '') ? reference.trim().substring(0, 255) : null;
      updateData.reference = validReference;
    }
    // ==== 개별 필드 선택적 업데이트 ===== //
    
    // 소식 게시판의 경우 썸네일 처리
    if (type === 'news') {
      if (req.files && req.files.thumbnail) {
        // 새 썸네일이 업로드된 경우 - 기존 썸네일 삭제 후 새것으로 교체
        if (post.thumbnail_url) {
          console.log("==기존 썸네일 삭제 (새 썸네일 업로드됨)== ");
          const basePath = getUploadBasePath();
          const relativePath = post.thumbnail_url.replace('/uploads', '');
          const oldThumbnailPath = path.resolve(basePath + relativePath);
          console.log('🗑️ 기존 썸네일 삭제 시도:', oldThumbnailPath);
          if (fs.existsSync(oldThumbnailPath)) {
            fs.unlinkSync(oldThumbnailPath);
            console.log('✅ 기존 썸네일 삭제 완료:', oldThumbnailPath);
          }
        }
        updateData.thumbnail_url = createFileUrl('thumbnails', 'news', req.files.thumbnail[0].filename);
        updateData.thumbnail_original_name = toUtf8NameIfNeeded(req.files.thumbnail[0].originalname);
      } else if (!shouldKeepThumbnail && post.thumbnail_url) {
        // 새 썸네일은 없지만 기존 썸네일을 삭제하라고 요청된 경우
        console.log("==기존 썸네일 삭제 (keepThumbnail: false)== ");
        const basePath = getUploadBasePath();
        const relativePath = post.thumbnail_url.replace('/uploads', '');
        const oldThumbnailPath = path.resolve(basePath + relativePath);
        console.log('🗑️ 기존 썸네일 삭제 시도:', oldThumbnailPath);
        if (fs.existsSync(oldThumbnailPath)) {
          fs.unlinkSync(oldThumbnailPath);
          console.log('✅ 기존 썸네일 삭제 완료:', oldThumbnailPath);
        }
        updateData.thumbnail_url = null;
        updateData.thumbnail_original_name = null;
      }
    }
    
    // 새로운 첨부파일 처리 (.fields() 구조로 통일)
    let hasNewFiles = false;
    let filesToSave = [];
    
    if (req.files && req.files.files && req.files.files.length > 0) {
      hasNewFiles = true;
      filesToSave = req.files.files;
    }
    
    if (hasNewFiles) {
      console.log('📚 새로운 첨부파일 감지, 기존 파일에 추가로 저장');
      console.log(`📁 수정 - ${type} 게시판 - files 처리:`, filesToSave.length, "개");
      
      const filePromises = filesToSave.map(file => {

        let safeOriginalName = toUtf8NameIfNeeded(file.originalname);
        if (!safeOriginalName) {
          const ext = path.extname(file.originalname) || '';
          safeOriginalName = `file${ext}`;
        }  
        const fileData = {
          type: type,
          post_id: parseInt(id),
          original_filename: safeOriginalName,
          saved_filename: file.filename,
          file_url: createFileUrl('attachments', type, file.filename),
          size: file.size,
          mimetype: file.mimetype
        };
        return fileRepository.save(fileRepository.create(fileData));
      });
      
      await Promise.all(filePromises);
      console.log(`✅ ${filesToSave.length}개의 새 파일 추가 저장 완료`);
    }
    
    // keepFileIds에 따른 기존 파일 관리
    let filesToDelete = [];
    if (keepFileIdArray !== null) {
      // keepFileIds가 제공된 경우: 지정된 ID만 유지, 나머지 삭제
      const keepSet = new Set(keepFileIdArray.map(id => Number(id)));
      filesToDelete = currentFiles.filter(file => !keepSet.has(file.id));
      
      console.log('📁 keepFileIds 제공됨:', keepFileIdArray);
      console.log('📁 유지할 파일 IDs:', Array.from(keepSet));
      console.log('📁 삭제할 파일 IDs:', filesToDelete.map(f => f.id));
    } else {
      // keepFileIds가 없는 경우: 기존 파일 모두 유지
      console.log('📁 keepFileIds 없음 - 기존 파일 모두 유지');
    }
    
    // 기존 파일 삭제 실행
    if (filesToDelete.length > 0) {
      console.log(`🗑️ ${filesToDelete.length}개 기존 파일 삭제 시작`);
      
      // DB에서 파일 정보 삭제
      const deleteIds = filesToDelete.map(f => f.id);
      await fileRepository.delete(deleteIds);
      
      // 물리 파일 삭제
      for (const file of filesToDelete) {
        const basePath = getUploadBasePath();
        const relativePath = file.file_url.replace('/uploads', '');
        const fullPath = path.resolve(basePath + relativePath);
        try {
          if (fs.existsSync(fullPath)) {
            await fs.promises.unlink(fullPath);
            console.log(`✅ 파일 삭제: ${file.original_filename} (${fullPath})`);
          } else {
            console.log(`⚠️ 파일 없음: ${file.original_filename} (${fullPath})`);
          }
        } catch (error) {
          console.error(`❌ 파일 삭제 실패: ${file.original_filename}`, error.message);
        }
      }
      
      console.log(`✅ ${filesToDelete.length}개 기존 파일 삭제 완료`);
    }
    
        console.log(" updateData : ", updateData)

    // updateData가 비어있지 않은 경우에만 업데이트 실행
    if (Object.keys(updateData).length > 0) {
    console.log(" updateData : ", updateData)
      await repository.update(parseInt(id), updateData);
    }
    
    const response = {
      id: parseInt(id),
      message: "게시글 수정 완료"
    };
    
    // 소식 게시판의 경우 thumbnail_url 포함
    if (type === 'news') {
      // 수정 후 최신 게시글 정보 조회
      const updatedPost = await repository.findOne({ where: { id: parseInt(id) } });
      if (updatedPost && updatedPost.thumbnail_url) {
        response.thumbnail_url = updatedPost.thumbnail_url;
        response.thumbnail_original_name = updatedPost.thumbnail_original_name;
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('게시글 수정 오류:', error);
    res.status(500).json({ success: false, message: '게시글 수정에 실패했습니다.' });
  }
}

// 게시글 삭제
export async function deletePost(req, res) {
  try {
    const { type, id } = req.params;
    
    const Entity = getEntityByType(type);
    const repository = AppDataSource_admin.getRepository(Entity);
    const fileRepository = AppDataSource_admin.getRepository(PostFile);
    
    const post = await repository.findOne({ where: { id: parseInt(id) } });
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    
    // 첨부파일 삭제
    const files = await fileRepository.find({
      where: { type: type, post_id: parseInt(id) }
    });
    
    files.forEach(file => {
      const basePath = getUploadBasePath();
      const relativePath = file.file_url.replace('/uploads', '');
      const fullPath = path.resolve(basePath + relativePath);
      console.log('🗑️ 첨부파일 삭제 시도:', fullPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log('✅ 첨부파일 삭제 완료:', fullPath);
      } else {
        console.log('⚠️ 첨부파일 없음:', fullPath);
      }
    });
    
    await fileRepository.delete({ type: type, post_id: parseInt(id) });
    
    // 소식 게시판 썸네일 삭제
    if (type === 'news' && post.thumbnail_url) {
      const basePath = getUploadBasePath();
      const relativePath = post.thumbnail_url.replace('/uploads', '');
      const thumbnailPath = path.resolve(basePath + relativePath);
      console.log('🗑️ 썸네일 삭제 시도:', thumbnailPath);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        console.log('✅ 썸네일 삭제 완료:', thumbnailPath);
      } else {
        console.log('⚠️ 썸네일 없음:', thumbnailPath);
      }
    }
    
    // 에디터 이미지 삭제 처리
    if (post.content) {
      deleteEditorImages(post.content);
    }
    
    await repository.delete(parseInt(id));
    
    res.json({
      message: "게시글 삭제 완료"
    });
  } catch (error) {
    console.error('게시글 삭제 오류:', error);
    res.status(500).json({ success: false, message: '게시글 삭제에 실패했습니다.' });
  }
}

// 에디터 이미지/동영상 업로드
export async function uploadEditorFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '이미지 또는 동영상 파일만 업로드 가능합니다.' });
    }
    
    const { type } = req.params;
    const fileUrl = createFileUrl('editor', type, req.file.filename);
    
    res.json({
      url: fileUrl
    });
  } catch (error) {
    console.error('에디터 파일 업로드 오류:', error);
    res.status(500).json({ success: false, message: '파일 업로드에 실패했습니다.' });
  }
}

// 첨부파일 삭제
export async function deleteAttachment(req, res) {
  try {
    const { type, postId, files_id } = req.params;
    const fileId = parseInt(files_id, 10);
    const postIdNum = parseInt(postId, 10);
    if (Number.isNaN(fileId) || Number.isNaN(postIdNum)) {
      return res.status(400).json({ success:false, message:'유효하지 않은 파일/게시글 ID 입니다.' });
    }
    
    const fileRepository = AppDataSource_admin.getRepository(PostFile);
    
    // 파일 정보 조회
    const file = await fileRepository.findOne({
      where: { 
       id: fileId,
       type,
       post_id: postIdNum
      }
    });
    
    if (!file) {
      return res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' });
    }
    
    // 실제 파일 삭제
    const basePath = getUploadBasePath();
    const relativePath = file.file_url.replace('/uploads', '');
    const fullPath = path.resolve(basePath + relativePath);
    console.log('🗑️ 개별 첨부파일 삭제 시도:', fullPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('✅ 개별 첨부파일 삭제 완료:', fullPath);
    } else {
      console.log('⚠️ 개별 첨부파일 없음:', fullPath);
    }
    
    // DB에서 파일 정보 삭제
    await fileRepository.delete(fileId);
    
    res.json({
      message: "파일 삭제 완료"
    });
  } catch (error) {
    console.error('첨부파일 삭제 오류:', error);
    res.status(500).json({ success: false, message: '첨부파일 삭제에 실패했습니다.' });
  }
}

// 썸네일 삭제 (news 게시판 전용)
export async function deleteThumbnail(req, res) {
  try {
    const { type, id } = req.params;
    
    // news 게시판만 썸네일 기능 제공
    if (type !== 'news') {
      return res.status(400).json({ 
        success: false, 
        message: '썸네일은 소식 게시판에서만 사용 가능합니다.' 
      });
    }
    
    const Entity = getEntityByType(type);
    const repository = AppDataSource_admin.getRepository(Entity);
    
    // 게시글 조회
    const post = await repository.findOne({ where: { id: parseInt(id) } });
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    
    // 썸네일이 없는 경우
    if (!post.thumbnail_url) {
      return res.status(404).json({ success: false, message: '삭제할 썸네일이 없습니다.' });
    }
    
    // 파일 시스템에서 썸네일 삭제
    const basePath = getUploadBasePath();
    const relativePath = post.thumbnail_url.replace('/uploads', '');
    const thumbnailPath = path.resolve(basePath + relativePath);
    console.log('🗑️ 개별 썸네일 삭제 시도:', thumbnailPath);
    if (fs.existsSync(thumbnailPath)) {
      try {
        fs.unlinkSync(thumbnailPath);
        console.log('✅ 개별 썸네일 삭제 완료:', thumbnailPath);
      } catch (fileError) {
        console.error('⚠️ 개별 썸네일 삭제 실패:', fileError.message);
        // 파일 삭제 실패해도 DB는 업데이트 (파일이 이미 없을 수 있음)
      }
    } else {
      console.log('⚠️ 개별 썸네일 없음:', thumbnailPath);
    }
    
    // DB에서 thumbnail_url 제거
    await repository.update(parseInt(id), { thumbnail_url: null });
    await repository.update(parseInt(id), { thumbnail_original_name: null });
    
    res.json({
      success: true,
      message: "썸네일 삭제 완료"
    });

  } catch (error) {
    console.error('썸네일 삭제 오류:', error);
    res.status(500).json({ success: false, message: '썸네일 삭제에 실패했습니다.' });
  }
}

// 첨부파일 다운로드
export async function downloadFile(req, res) {
  try {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
    
    const { type, fileId } = req.params;

    // DB에서 파일 정보 조회
    const fileRepository = AppDataSource_admin.getRepository(PostFile);
    const file = await fileRepository.findOne({
      where: { id: parseInt(fileId), type }
    });

    if (!file) {
      return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
    }

    const basePath = getUploadBasePath();
    const relativePath = file.file_url.replace('/uploads', '');
    const filePath = path.resolve(basePath + relativePath);

    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      console.log(`❌ 파일 없음: ${filePath}`);
      return res.status(404).json({ message: '파일이 존재하지 않습니다.' });
    }

    console.log(`📁 다운로드 요청: ${file.original_filename}`);
    console.log(`📁 파일 경로: ${filePath}`);

    // 한글 파일명 처리 (RFC 5987 표준)
    const encodedFilename = encodeURIComponent(file.original_filename);
    
    // 강제 다운로드 헤더 설정
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'application/octet-stream');

    res.download(filePath, file.original_filename);
  } catch (error) {
    console.error('다운로드 오류:', error);
    res.status(500).json({ message: '다운로드 실패' });
  }
}

// ========== 💰 요금관리 기능 💰 ==========

// 1. 요금설정 조회
export async function getPricingSettings(req, res) {
  try {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
    
    const { service_id, lang = 'kor' } = req.query;
    const targetServiceId = service_id;
    
    // lang 유효성 검증
    if (!['kor', 'eng'].includes(lang)) {
      return res.status(400).json({
        success: false,
        message: 'lang 매개변수는 "kor" 또는 "eng"만 허용됩니다.'
      });
    }
    
    const result = await adminService.getPricingSettings(targetServiceId, lang);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        success: false,
        message: result.message
      });
    }
    
    res.json({
      success: true,
      data: [result.data]
    });

  } catch (error) {
    console.error('요금설정 조회 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '요금설정 조회에 실패했습니다.' 
    });
  }
}

// 2. 요금설정 수정
export async function updatePricingSettings(req, res) {
  try {
    console.log('=== 컨트롤러 디버깅 (Form-data 전용) ===');
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);
    
    const serviceId = Number(req.params.serviceId);
    const result = await adminService.updatePricingSettings(serviceId, req.body, req.file);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    return res.json({ success: true, message: '요금설정이 수정되었습니다.' });
  } catch (e) {
    console.error('요금설정 수정 오류:', e);
    // 유효성 검증 에러는 400으로 처리
    if (e.message.includes('유효하지 않은 필드명') || e.message.includes('업데이트할 필드가 없습니다')) {
      return res.status(400).json({ success: false, message: e.message });
    }
    return res.status(500).json({ success: false, message: '요금설정 수정에 실패했습니다.' });
  }
}

// 3. 개별 플랜 수정 - PATCH /api/admin/pricing/plan/:plan_id
export async function updateSinglePlan(req, res) {
  try {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
    
    const { plan_id } = req.params;
    
    // plan_id 검증
    if (!plan_id) {
      return res.status(400).json({
        success: false,
        message: 'plan_id는 필수 항목입니다.'
      });
    }
    
    // req.body를 통째로 전달하고 plan_id 추가
    const updateData = {
      plan_id: parseInt(plan_id),
      ...req.body  // 모든 필드를 포함하여 전달 (잘못된 필드 필터낼려고)
    };
    
    const result = await adminService.updateSinglePlan(updateData);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        success: false,
        message: result.message
      });
    }
    
    res.json({
      success: true,
      message: "요금설정이 수정되었습니다."
    });

  } catch (error) {
    console.error('개별 플랜 수정 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '요금설정 수정에 실패했습니다.' 
    });
  }
}

// 4. 서비스 활성화/비활성화 토글
export async function toggleService(req, res) {
  try {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
    
    const { service_id, is_active } = req.body;
    
    const result = await adminService.toggleService(service_id, is_active);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        success: false,
        message: result.message
      });
    }
    
    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('서비스 토글 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '서비스 상태 변경에 실패했습니다.' 
    });
  }
}

// 5. 플랜 활성화/비활성화 토글
export async function togglePlan(req, res) {
  try {
    console.log(`** 요청 URL ====> ${req.method} ${req.originalUrl}`);
    
    const { service_id, plan_id, is_active } = req.body;
    console.log(" service_id : ", service_id);
    const result = await adminService.togglePlan(service_id, plan_id, is_active);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        success: false,
        message: result.message
      });
    }
    
    res.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('플랜 토글 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '플랜 상태 변경에 실패했습니다.' 
    });
  }
}