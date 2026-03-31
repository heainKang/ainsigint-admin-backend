// 한국시간 기준 만료일 계산 함수
export function addDays(days) {
  const result = new Date();
    result.setDate(result.getDate() + days);
    return result.toISOString().slice(0, 10); // ✅ "YYYY-MM-DD"
}