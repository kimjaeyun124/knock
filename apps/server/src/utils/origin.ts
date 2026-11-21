/**
 * 브라우저가 보낸 Origin 이 허용된 출처인지 확인한다.
 * 허용: 설정된 웹 출처, 또는 요청을 받은 서버 자신의 출처(같은 출처 배포).
 * Origin 헤더가 없으면(브라우저가 아닌 클라이언트) 이 검사로는 판단하지 않는다.
 */
export function isAllowedOrigin(
  origin: string,
  allowedOrigins: readonly string[],
  requestHost: string | undefined,
): boolean {
  if (allowedOrigins.includes(origin)) return true
  if (!requestHost) return false
  return origin === `http://${requestHost}` || origin === `https://${requestHost}`
}
