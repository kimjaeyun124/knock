import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

/** 임의의 빈 포트에 앱을 띄우고 base URL을 넘겨 준다. 끝나면 서버를 닫는다. */
export async function withTestServer(
  app: Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = await new Promise((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })
  try {
    const { port } = server.address() as AddressInfo
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }
}

export const WEB_ORIGIN = 'http://localhost:5173'

/** 브라우저처럼 쿠키를 보관하고 Origin 을 붙여 요청하는 테스트용 클라이언트 */
export class TestClient {
  cookie: string | undefined

  constructor(
    readonly baseUrl: string,
    private readonly origin: string | null = WEB_ORIGIN,
  ) {}

  async request(
    path: string,
    init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...init.headers }
    if (this.cookie) headers.Cookie = this.cookie
    if (this.origin && !('Origin' in headers)) headers.Origin = this.origin
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })

    for (const setCookie of res.headers.getSetCookie()) {
      const pair = setCookie.split(';')[0] ?? ''
      const [name, ...rest] = pair.split('=')
      if (!name) continue
      const value = rest.join('=')
      // 값이 비었으면 브라우저가 쿠키를 지운 것과 같다.
      this.cookie = value === '' ? undefined : `${name}=${value}`
    }
    return res
  }

  get(path: string, headers?: Record<string, string>) {
    return this.request(path, headers ? { headers } : {})
  }

  post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request(path, {
      method: 'POST',
      ...(body !== undefined ? { body } : {}),
      ...(headers ? { headers } : {}),
    })
  }

  put(path: string, body: unknown, headers?: Record<string, string>) {
    return this.request(path, { method: 'PUT', body, ...(headers ? { headers } : {}) })
  }

  delete(path: string, headers?: Record<string, string>) {
    return this.request(path, { method: 'DELETE', ...(headers ? { headers } : {}) })
  }
}
