/**
 * 교차 소스 중복 판별을 위한 URL 정규화.
 * - 호스트 소문자화, `www.` 제거
 * - 추적 쿼리스트링/프래그먼트 제거
 * - 끝의 슬래시 정리
 * 실패하면 원본을 그대로 반환한다.
 */
export function canonicalizeUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    let host = url.host.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    url.host = host;
    let out = url.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return rawUrl;
  }
}
