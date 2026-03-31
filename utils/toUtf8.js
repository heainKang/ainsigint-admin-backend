// DB에 저장할 “원본 파일명" 
// 디스크에 저장되는 파일명(경로) 을 만들 때는 절대 쓰지 말고, ASCII-safe로 sanitize
// toUtf8Name은 라틴-1로 깨져 보이는 문자열을 UTF-8로 복원해 줍니다.
// 이미 정상 한글(UTF-8)인 문자열에 또 적용하면 오히려 깨질 수 있어요(이중 디코딩).
// 깨진 문자열 정리 공용 클린업
const clean = (s) => (s || '')
  .replace(/\x00/g, '')
  .replace(/[\x00-\x1F\x7F]/g, '')
  .trim();

/**
 * 업로드된 파일명 복원:
 * - 이미 한글/한자 범위가 보이면 그대로(clean만)
 * - 라틴1 상위바이트(Ã, ì, í, ë, ê, á 등) 모지바케 패턴이면 latin1→utf8 복원
 * - 그 외는 원문 사용
 */
export function toUtf8NameIfNeeded(name) {
  if (!name) return '';
  const s = String(name);

  // 이미 한글/한글자모/호환자모/한자 포함 → 복원 불필요
  if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\u4E00-\u9FFF]/.test(s)) {
    return clean(s);
  }

  // 라틴-1 상위바이트(0x80~0xFF)가 섞여 있고, 흔한 모지바케 문자 존재 → 복원 시도
  const hasHighLatin1 = /[\u0080-\u00FF]/.test(s);
  const looksMojibake = /(?:Ã|ì|í|ë|ê|á|¼|½|¾|ð|Ý|Þ)/.test(s);

  if (hasHighLatin1 || looksMojibake) {
    try {
      const decoded = Buffer.from(s, 'latin1').toString('utf8');
      // 복원 결과에 한글/한자 보이면 성공으로 간주
      if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\u4E00-\u9FFF]/.test(decoded)) {
        return clean(decoded);
      }
      return clean(decoded); // 한글이 아니어도 일단 복원본 사용
    } catch {
      return clean(s);
    }
  }

  // ASCII만 있거나 특이점 없음 → 원문
  return clean(s);
}




/*
IfNeeded는 DB에만 쓰는 게 맞고(사람이 보는 값), 실제 디스크에 저장되는 파일명은 미들웨어에서 sanitize된 이름을 이미 쓰고 있으니 그대로 두면 됩니다.

*/

// DB에 주소값 없애고 저장하려고  ✅   normalizeUploadsInHtml 함수만듬.✅   (inset, update시 db저장 전 context에 적용함.)
/*
<img src="http://192.168.10.129:8109/uploads/editor/news/abc.png">
<video src="https://dev.example.com/uploads/editor/video/test.mp4"></video>
<source src="uploads/editor/video/test720p.mp4" type="video/mp4">
<audio src="http://localhost:8109/uploads/audio/bgm.mp3"></audio>
<iframe src="http://192.168.0.5:8109/uploads/embed/player.html"></iframe>


===>

<img src="/uploads/editor/news/abc.png">
<video src="/uploads/editor/video/test.mp4"></video>
<source src="/uploads/editor/video/test720p.mp4" type="video/mp4">
<audio src="/uploads/audio/bgm.mp3"></audio>
<iframe src="/uploads/embed/player.html"></iframe>

로 만들어줌.

*/
export function normalizeUploadsInHtml(html) {
  if (!html) return html;

  return html
    // 1) http:// 또는 https:// 도메인 붙은 업로드 경로 → /uploads/ 로 축약
    .replace(/src=["']https?:\/\/[^"']+(\/uploads\/[^"']+)["']/gi, 'src="$1"')

    // 2) src="uploads/... → src="/uploads/ 로 보정
    .replace(/src=["']uploads\//gi, 'src="/uploads/');
}
