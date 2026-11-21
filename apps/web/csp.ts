/**
 * 운영에서 웹 화면을 내보낼 때(리버스 프록시) 붙이는 Content-Security-Policy.
 * 다른 곳에서 불러온 스크립트·스타일·연결을 막아, 화면에 악성 코드가 끼어들 여지를 줄인다.
 *
 * - 스크립트·스타일은 같은 출처의 파일만 허용한다. (인라인 스크립트 금지)
 * - style-src-attr 'unsafe-inline': 화면이 막대 높이 등을 style 속성으로 지정하기 때문이다. (스크립트는 아님)
 * - connect-src 'self': API 와 실시간(WebSocket) 연결이 같은 출처이기 때문이다. (docs/OPERATIONS.md)
 * - worker-src 'self': 푸시를 받는 서비스 워커(/sw.js).
 *
 * `npm run preview -w @tetris/web` 가 이 헤더를 붙여 서비스하고, E2E(csp.spec.ts)가
 * 이 정책 아래에서 운영 빌드가 정상 동작하는지 확인한다.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')
