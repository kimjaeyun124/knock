import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema } from '@tetris/shared'
import { LOGIN_MAX_FAILURES } from '@/config/auth'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

describe('보안 헤더와 오류 응답', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('보안 헤더가 붙고 서버 종류는 알리지 않는다', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/health`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-powered-by')).toBeNull()
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('로그인 관련 응답은 저장되지 않는다 (Cache-Control: no-store)', async () => {
    const user = await ctx.createHousehold()
    const client = await ctx.loginAs(user)
    for (const path of [
      '/api/auth/me',
      '/api/sensors',
      '/api/alerts',
      '/api/timeline',
      '/api/timeline/summary',
      '/api/settings/detection',
      '/api/household',
    ]) {
      const res = await client.get(path)
      expect(res.headers.get('cache-control'), path).toBe('no-store')
    }
  })

  it('없는 경로·잘못된 JSON·너무 큰 본문은 HTML 이나 내부 정보 없이 JSON 오류로 답한다', async () => {
    const missing = await fetch(`${ctx.baseUrl}/api/nope`)
    expect(missing.status).toBe(404)
    expect(ApiErrorBodySchema.parse(await missing.json()).error.code).toBe('NOT_FOUND')

    const broken = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    })
    expect(broken.status).toBe(400)
    const brokenText = await broken.text()
    expect(ApiErrorBodySchema.parse(JSON.parse(brokenText)).error.code).toBe('BAD_REQUEST')
    expect(brokenText).not.toMatch(/at .*\.(ts|js):\d+|node_modules|SyntaxError/)

    const huge = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }),
    })
    expect(huge.status).toBe(413)
    expect(ApiErrorBodySchema.safeParse(await huge.json()).success).toBe(true)
  })

  it('세션 쿠키는 JavaScript 에서 읽을 수 없고 같은 사이트 요청에만 붙는다', async () => {
    const user = await ctx.createHousehold()
    const res = await new TestClient(ctx.baseUrl).post('/api/auth/login', {
      email: user.email,
      password: user.password,
    })
    const cookie = res.headers.getSetCookie().join('\n')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('장치용 수집 API 는 쿠키로는 인증되지 않는다 (사용자 인증과 분리)', async () => {
    const user = await ctx.createHousehold()
    const client = await ctx.loginAs(user)
    const res = await fetch(`${ctx.baseUrl}/api/ingest/v1/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: client.cookie ?? '' },
      body: '{}',
    })
    expect(res.status).toBe(401)
  })
})

describe('리버스 프록시 뒤의 접속자 IP (TRUST_PROXY)', () => {
  async function failedLogins(ctx: TestContext, forwardedFor: string, times: number) {
    const user = await ctx.createHousehold()
    const client = new TestClient(ctx.baseUrl)
    let last = 0
    for (let i = 0; i < times; i += 1) {
      last = (
        await client.post(
          '/api/auth/login',
          { email: user.email, password: 'wrong-password' },
          { 'X-Forwarded-For': forwardedFor },
        )
      ).status
    }
    return { user, client, last }
  }
  const loginAs = (client: TestClient, email: string, password: string, forwardedFor: string) =>
    client.post('/api/auth/login', { email, password }, { 'X-Forwarded-For': forwardedFor })

  it('프록시를 믿지 않으면(기본) X-Forwarded-For 를 무시한다 — 헤더로 시도 제한을 피할 수 없다', async () => {
    const ctx = await createTestContext()
    try {
      const { user, client } = await failedLogins(ctx, '10.0.0.1', LOGIN_MAX_FAILURES)
      // 다른 주소인 척해도 같은 접속으로 보고 계속 막는다
      const res = await loginAs(client, user.email, user.password, '10.0.0.2')
      expect(res.status).toBe(429)
    } finally {
      await ctx.close()
    }
  })

  it('프록시 1단을 믿으면 접속자 IP 별로 시도를 센다 — 한 사람의 실패가 다른 접속자를 막지 않는다', async () => {
    const ctx = await createTestContext({ env: { TRUST_PROXY: 1 } })
    try {
      const { user, client, last } = await failedLogins(ctx, '10.0.0.1', LOGIN_MAX_FAILURES)
      expect(last).toBe(401)
      expect((await loginAs(client, user.email, 'wrong-password', '10.0.0.1')).status).toBe(429) // 같은 접속자는 막힘
      expect((await loginAs(client, user.email, user.password, '10.0.0.2')).status).toBe(200) // 다른 접속자는 정상
    } finally {
      await ctx.close()
    }
  })
})

describe('사용자용 API 요청 제한 (API_RATE_LIMIT_PER_MINUTE)', () => {
  let limited: TestContext

  beforeAll(async () => {
    limited = await createTestContext({ env: { API_RATE_LIMIT_PER_MINUTE: 5 } })
  })
  afterAll(async () => {
    await limited.close()
  })

  it('한도를 넘으면 429 와 Retry-After 로 답하고, 시간이 지나면 다시 받는다', async () => {
    const get = () => fetch(`${limited.baseUrl}/api/auth/me`)
    for (let i = 0; i < 5; i += 1) expect((await get()).status).toBe(401)

    const blocked = await get()
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    const body = (await blocked.json()) as { error: { code: string } }
    expect(body.error.code).toBe('RATE_LIMITED')

    limited.clock.advance(61_000)
    expect((await get()).status).toBe(401)
  })

  it('상태 점검과 장치 수집 API 는 이 제한을 받지 않는다 (장치는 센서별 제한이 따로 있다)', async () => {
    for (let i = 0; i < 12; i += 1) {
      expect((await fetch(`${limited.baseUrl}/api/health`)).status).not.toBe(429)
      expect(
        (await fetch(`${limited.baseUrl}/api/ingest/v1/heartbeat`, { method: 'POST' })).status,
      ).toBe(401) // 토큰이 없어 거부될 뿐, 요청 제한(429)은 아니다
    }
  })
})
