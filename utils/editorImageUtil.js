import fs from "fs";
import path from "path";
 
//✅ 게시글 삭제시 본문에서 추출해서 에디터 이미지 삭제 ✅
export function deleteEditorImages(content) {
  if (!content) {
    console.log("본문 content 없음, 이미지 삭제 생략");
    return;
  }
  
  // HTML 본문에서 업로드된 미디어 src 경로 추출
  const urls = extractEditorImageUrls(content);
  console.log("삭제할 본문 이미지 경로:", urls);
  
  // 추출된 각 URL을 파일 경로로 변환하고 삭제
  urls.forEach(url => {
    // relativePath로 추출 http://localhost:3000/uploads/editor/manual/xxx.png → uploads/editor/manual/xxx.png
    const relativePath = url.replace(/^https?:\/\/[^/]+\/?/, "");
    const filePath = path.join(".", relativePath);

    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, err => {
        if (err) console.error("본문 이미지 삭제 실패:", filePath, err);
        else console.log("삭제 성공:", filePath);
      });
    } else {
      console.warn("파일 없음 (삭제 생략):", filePath);
    }
  });
}

// ✅ HTML 본문에서 업로드된 미디어 src 경로 추출  <img src="/uploads/editor/..."> 추출
// uploads/editor/ 이 경로 포함이면 모두 삭제
// img|video|audio|source|iframe 추출중
export function extractEditorImageUrls(content) {
  const regex = /<(img|video|audio|source|iframe)[^>]+src=["']([^"']*\/uploads\/editor\/[^"']+)["']/g;
  const urls = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    urls.push(match[2]); // src 경로만 추출
  }
  return urls;
}