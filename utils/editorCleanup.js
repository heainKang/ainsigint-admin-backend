import fs from "fs";
import path from "path";
import { AppDataSource_admin } from "../config/data-sources_admin.js";
import { ManualPost } from "../models/posts/manualPost.entity.js";
import { PaperPost } from "../models/posts/paperPost.entity.js";
import { NewsPost } from "../models/posts/newsPost.entity.js";
import { getEditorPath } from "./uploadPaths.js";

/**
 * 에디터 파일 정리 유틸리티
 * 
 * 목적: 게시글 본문(content 컬럼)에서 실제로 사용되지 않는 에디터 업로드 파일들을 자동 삭제
 * 
 * 작동 원리:
 * 1. DB에서 모든 게시글의 content 컬럼을 스캔하여 실제 사용 중인 파일 목록 수집
 * 2. 서버의 uploads/editor/ 디렉토리에 있는 파일들과 비교
 * 3. DB에서 참조되지 않는 파일들만 안전하게 삭제
 * 
 * 실행 시점:
 * - 서버 시작 시 자동 실행 (3초 지연 후 TypeORM 초기화 대기)
 * - 수동 API 호출: POST /api/admin/cleanup/editor
 */

// 게시글 타입별 엔티티 매핑 (TypeORM Entity 클래스들)
const ENTITIES = {
  manual: ManualPost,  // 매뉴얼 게시판
  paper : PaperPost,   // 논문 게시판  
  news: NewsPost       // 뉴스/소식 게시판
};

/**
 * DB에서 실제 사용 중인 에디터 파일 목록을 수집하는 함수
 * 
 * @returns {Set<string>} 사용 중인 파일명들의 Set (예: "image123.png", "video456.mp4")
 * 
 * 작동 과정:
 * 1. 각 게시판 타입별로 모든 게시글의 content 컬럼을 조회
 * 2. HTML 본문에서 img, video, audio, source, iframe 태그의 src 속성 검사
 * 3. /uploads/editor/ 경로를 포함한 파일 URL만 추출
 * 4. 전체 URL에서 파일명만 추출하여 Set에 저장 (중복 제거)
 */
async function getUsedEditorFiles() {
  const usedFiles = new Set(); // 중복 제거를 위한 Set 사용
  
  // 각 게시판 타입별로 순차 처리
  for (const [type, Entity] of Object.entries(ENTITIES)) {
    try {
      // TypeORM Repository를 통해 해당 엔티티의 데이터 조회
      const repository = AppDataSource_admin.getRepository(Entity);
      const posts = await repository.find({
        select: ['content'] // content 컬럼만 선택하여 성능 최적화
      });
      
      // 각 게시글의 본문을 순회하며 파일 URL 추출
      posts.forEach(post => {
        if (post.content) {
          // HTML 태그에서 에디터 업로드 파일 경로를 찾는 정규식
          // 매칭 대상: <img src="/uploads/editor/manual/123.png">, <video src="/uploads/editor/news/456.mp4"> 등
          const regex = /<(img|video|audio|source|iframe)[^>]+src=["']([^"']*\/uploads\/editor\/[^"']+)["']/g;
          let match;
          
          // 정규식으로 모든 매칭 항목 찾기
          while ((match = regex.exec(post.content)) !== null) {
            const url = match[2]; // src 속성의 전체 URL
            // 전체 경로에서 파일명만 추출 (예: "/uploads/editor/manual/123.png" → "123.png")
            const fileName = path.basename(url);
            usedFiles.add(fileName); // Set에 추가 (중복 자동 제거)
          }
        }
      });
      
      console.log(`✅ ${type} 게시판 ${posts.length}개 게시글 스캔 완료`);
    } catch (error) {
      console.error(`❌ ${type} 게시판 스캔 오류:`, error.message);
    }
  }
  
  return usedFiles;
}

/**
 * 특정 디렉토리의 파일들을 정리하는 함수
 * 
 * @param {string} dirPath - 정리할 디렉토리 경로 (예: "uploads/editor/manual")
 * @param {Set<string>} usedFiles - DB에서 사용 중인 파일명들의 Set
 * @returns {Object} 정리 결과 통계 { deleted: 삭제된 파일 수, kept: 유지된 파일 수 }
 * 
 * 작동 과정:
 * 1. 디렉토리 존재 여부 확인
 * 2. 디렉토리 내 모든 파일 목록 조회
 * 3. 각 파일이 DB에서 사용 중인지 확인
 * 4. 사용되지 않는 파일만 삭제, 사용 중인 파일은 보호
 */
function cleanupDirectory(dirPath, usedFiles) {
  // 디렉토리 존재 여부 확인
  if (!fs.existsSync(dirPath)) {
    console.log(`📁 디렉토리 없음: ${dirPath}`);
    return { deleted: 0, kept: 0 };
  }
  
  // 디렉토리 내 모든 파일/폴더 목록 조회
  const files = fs.readdirSync(dirPath);
  let deletedCount = 0; // 삭제된 파일 카운터
  let keptCount = 0;    // 유지된 파일 카운터
  
  // 각 파일에 대해 처리
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    // 파일인지 확인 (디렉토리는 건드리지 않음)
    if (stat.isFile()) {
      // DB에서 사용되지 않는 파일인지 확인
      if (!usedFiles.has(file)) {
        try {
          // 파일 삭제 시도
          fs.unlinkSync(filePath);
          console.log(`🗑️  삭제: ${filePath}`);
          deletedCount++;
        } catch (error) {
          // 삭제 실패 시 오류 로그 (권한 문제, 파일 사용 중 등)
          console.error(`❌ 삭제 실패: ${filePath}`, error.message);
        }
      } else {
        // DB에서 사용 중인 파일은 보호 (삭제하지 않음)
        keptCount++;
      }
    }
  });
  
  return { deleted: deletedCount, kept: keptCount };
}

/**
 * 에디터 파일 정리 메인 함수 (외부에서 호출되는 진입점)
 * 
 * @returns {Object} 전체 정리 결과 통계 { deleted: 총 삭제 파일 수, kept: 총 유지 파일 수 }
 * 
 * 전체 프로세스:
 * 1. 성능 측정을 위한 시작 시간 기록
 * 2. DB에서 실제 사용 중인 파일 목록 수집
 * 3. 각 게시판별 에디터 디렉토리 순차 정리
 * 4. 전체 결과 통계 취합 및 로그 출력
 * 5. 작업 소요 시간 계산 및 리포트
 */
export async function cleanupEditorFiles() {
  console.log('🧹 에디터 파일 정리 시작...');
  const startTime = Date.now(); // 성능 측정용 시작 시간
  
  try {
    // 1단계: DB에서 실제 사용 중인 파일 목록 수집
    console.log('📊 사용 중인 파일 스캔...');
    const usedFiles = await getUsedEditorFiles();
    console.log(`📋 사용 중인 파일: ${usedFiles.size}개`);
    
    // 2단계: 각 게시판별 에디터 디렉토리 정리
    const editorDirs = ['manual', 'paper', 'news']; // 정리 대상 디렉토리 목록
    let totalStats = { deleted: 0, kept: 0 }; // 전체 통계 누적용 객체
    
    // 각 디렉토리를 순차적으로 정리
    for (const type of editorDirs) {
      const dirPath = path.resolve(getEditorPath(type)); // 환경변수 기반 경로 생성
      console.log(`\n🔍 ${type} 디렉토리 정리: ${dirPath}`);
      
      // 해당 디렉토리 정리 실행
      const stats = cleanupDirectory(dirPath, usedFiles);
      
      // 전체 통계에 누적
      totalStats.deleted += stats.deleted;
      totalStats.kept += stats.kept;
      
      // 디렉토리별 결과 로그
      console.log(`   삭제: ${stats.deleted}개, 유지: ${stats.kept}개`);
    }
    
    // 3단계: 최종 결과 리포트
    const duration = Date.now() - startTime; // 총 소요 시간 계산
    console.log(`\n✅ 정리 완료! 총 ${totalStats.deleted}개 삭제, ${totalStats.kept}개 유지 (${duration}ms)`);
    
    return totalStats; // 결과 통계 반환 (API 응답이나 로깅에 사용)
  } catch (error) {
    console.error('❌ 에디터 파일 정리 오류:', error);
    throw error; // 상위 함수로 오류 전파
  }
}

/**
 * 수동 실행용 함수 (CLI에서 직접 호출할 때 사용)
 * 
 * Node.js 스크립트로 직접 실행할 때 사용하는 래퍼 함수
 * 정리 작업 완료 후 프로세스를 종료함
 * 
 * 사용법: node utils/editorCleanup.js
 */
export async function runCleanup() {
  try {
    await cleanupEditorFiles();
    process.exit(0); // 성공 시 정상 종료
  } catch (error) {
    console.error('정리 작업 실패:', error);
    process.exit(1); // 실패 시 오류 코드로 종료
  }
}

