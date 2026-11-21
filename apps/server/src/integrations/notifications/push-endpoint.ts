/**
 * 브라우저가 알려 준 푸시 서비스 주소가 안전한지 확인한다. 서버는 이 주소로 직접 요청을 보내므로,
 * 로그인한 사용자가 서버 내부 주소(localhost, 사설 IP 등)로 요청을 보내게 만들 수 없게 막는다. (SSRF 방어)
 *
 * 한계: 도메인 이름이 나중에 내부 IP 로 바뀌는 경우(DNS 재바인딩)까지는 막지 못한다.
 */
export function isSafePushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  if (url.port !== '') return false // 푸시 서비스는 기본 포트(443)를 쓴다
  const host = url.hostname.toLowerCase()
  if (host.startsWith('[') || /^\d+(\.\d+){0,3}$/.test(host)) return false // IP 주소 직접 지정
  if (!host.includes('.')) return false // localhost 같은 한 단어 이름
  if (/\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host)) return false
  return true
}
