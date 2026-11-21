/** Cookie 헤더를 파싱한다. 객체 대신 Map을 써서 `__proto__` 같은 이름이 문제를 일으키지 않게 한다. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    const name = part.slice(0, separator).trim()
    let value = part.slice(separator + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      cookies.set(name, value)
    }
  }
  return cookies
}
