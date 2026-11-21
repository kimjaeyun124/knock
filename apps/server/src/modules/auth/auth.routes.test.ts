import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema, AuthSessionResponseSchema } from '@tetris/shared'
import { SESSION_COOKIE_NAME } from '@/config/auth'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { hashToken } from '@/utils/tokens'

const DAY_MS = 24 * 60 * 60 * 1000

describe('인증 API', () => {
  let ctx: TestContext
  let guardian: TestHousehold

  beforeAll(async () => {
    ctx = await createTestContext()
    guardian = await ctx.createHousehold({ email: 'main@example.com', password: 'correct-horse-1' })
  })
  afterAll(async () => {
    await ctx.close()
  })

  const newClient = () => new TestClient(ctx.baseUrl)

  async function errorOf(res: Response) {
    return ApiErrorBodySchema.parse(await res.json()).error
  }

  describe('로그인', () => {
    it('올바른 정보로 로그인하면 세션 쿠키와 사용자 정보를 돌려준다', async () => {
      const client = newClient()
      const res = await client.post('/api/auth/login', {
        email: guardian.email,
        password: guardian.password,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')

      const body = AuthSessionResponseSchema.parse(await res.json())
      expect(body.guardian.email).toBe(guardian.email)
      expect(body.household.id).toBe(guardian.householdId)
      expect(body.household.recipientAlias).toBe('어르신(테스트)')
      expect(JSON.stringify(body)).not.toContain('passwordHash')

      const setCookie = res.headers.getSetCookie().join('\n')
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')
      expect(setCookie).toContain('Path=/')
      expect(setCookie).not.toContain('Secure')
    })

    it('DB에는 토큰 원문이 아니라 해시만 저장한다', async () => {
      const client = newClient()
      await client.post('/api/auth/login', { email: guardian.email, password: guardian.password })
      const token = client.cookie?.split('=')[1] ?? ''
      expect(token.length).toBeGreaterThan(30)

      const stored = await ctx.prisma.session.findUnique({ where: { id: hashToken(token) } })
      expect(stored?.guardianId).toBe(guardian.guardianId)
      expect(await ctx.prisma.session.findUnique({ where: { id: token } })).toBeNull()
    })

    it('이메일의 대소문자와 앞뒤 공백은 무시한다', async () => {
      const res = await newClient().post('/api/auth/login', {
        email: '  MAIN@Example.COM ',
        password: guardian.password,
      })
      expect(res.status).toBe(200)
    })

    it('비밀번호가 틀린 경우와 없는 계정은 같은 응답이다 (가입 여부를 알려 주지 않음)', async () => {
      const wrongPassword = await newClient().post('/api/auth/login', {
        email: guardian.email,
        password: 'wrong-password',
      })
      const unknownEmail = await newClient().post('/api/auth/login', {
        email: 'nobody@example.com',
        password: 'wrong-password',
      })
      expect(wrongPassword.status).toBe(401)
      expect(unknownEmail.status).toBe(401)
      const a = await errorOf(wrongPassword)
      const b = await errorOf(unknownEmail)
      expect(a.code).toBe('UNAUTHORIZED')
      expect(a.message).toBe('이메일 또는 비밀번호가 올바르지 않습니다.')
      expect(b.message).toBe(a.message)
    })

    it('필수 값이 빠지거나 형식이 틀리면 400 VALIDATION_ERROR 이다', async () => {
      const missing = await newClient().post('/api/auth/login', { email: guardian.email })
      expect(missing.status).toBe(400)
      expect((await errorOf(missing)).code).toBe('VALIDATION_ERROR')

      const badEmail = await newClient().post('/api/auth/login', {
        email: 'not-an-email',
        password: 'x',
      })
      expect(badEmail.status).toBe(400)
    })

    it('이미 로그인된 브라우저가 다시 로그인하면 이전 세션은 무효가 된다', async () => {
      const first = newClient()
      await first.post('/api/auth/login', { email: guardian.email, password: guardian.password })
      const oldCookie = first.cookie

      const second = newClient()
      second.cookie = oldCookie
      await second.post('/api/auth/login', { email: guardian.email, password: guardian.password })

      const stale = newClient()
      stale.cookie = oldCookie
      expect((await stale.get('/api/auth/me')).status).toBe(401)
      expect((await second.get('/api/auth/me')).status).toBe(200)
    })
  })

  describe('로그인 시도 제한', () => {
    it('5번 연속 실패하면 올바른 비밀번호도 잠시 거부하고, 시간이 지나면 풀린다', async () => {
      const target = await ctx.createHousehold({
        email: 'throttle@example.com',
        password: 'right-password-1',
      })
      const client = newClient()

      for (let i = 0; i < 5; i += 1) {
        const res = await client.post('/api/auth/login', {
          email: target.email,
          password: 'bad-password',
        })
        expect(res.status).toBe(401)
      }
      const locked = await client.post('/api/auth/login', {
        email: target.email,
        password: target.password,
      })
      expect(locked.status).toBe(429)
      const error = await errorOf(locked)
      expect(error.code).toBe('RATE_LIMITED')
      expect(error.message).toContain('분 뒤에 다시 시도')

      ctx.clock.advance(16 * 60 * 1000)
      const after = await client.post('/api/auth/login', {
        email: target.email,
        password: target.password,
      })
      expect(after.status).toBe(200)
    })

    it('성공하면 실패 횟수가 초기화된다', async () => {
      const target = await ctx.createHousehold({
        email: 'reset@example.com',
        password: 'right-password-2',
      })
      const client = newClient()
      for (let round = 0; round < 3; round += 1) {
        for (let i = 0; i < 4; i += 1) {
          await client.post('/api/auth/login', { email: target.email, password: 'bad-password' })
        }
        const ok = await client.post('/api/auth/login', {
          email: target.email,
          password: target.password,
        })
        expect(ok.status).toBe(200)
      }
    })
  })

  describe('현재 로그인 확인과 로그아웃', () => {
    it('로그인하지 않았거나 쿠키가 엉터리면 401 이다', async () => {
      const anonymous = await newClient().get('/api/auth/me')
      expect(anonymous.status).toBe(401)
      expect((await errorOf(anonymous)).code).toBe('UNAUTHORIZED')

      const forged = newClient()
      forged.cookie = `${SESSION_COOKIE_NAME}=forged-token-value`
      expect((await forged.get('/api/auth/me')).status).toBe(401)
    })

    it('로그인 후 me 가 성공하고, 로그아웃하면 세션이 폐기되어 다시 401 이다', async () => {
      const client = newClient()
      await client.post('/api/auth/login', { email: guardian.email, password: guardian.password })
      expect((await client.get('/api/auth/me')).status).toBe(200)
      const token = client.cookie ?? ''

      const out = await client.post('/api/auth/logout')
      expect(out.status).toBe(200)
      expect(await out.json()).toEqual({ ok: true })
      expect(client.cookie).toBeUndefined()

      // 쿠키를 지우는 것만이 아니라 서버에서도 세션이 사라져야 한다 (탈취된 쿠키 재사용 방지)
      const replay = newClient()
      replay.cookie = token
      expect((await replay.get('/api/auth/me')).status).toBe(401)
    })

    it('로그인하지 않은 상태의 로그아웃도 성공으로 응답한다', async () => {
      expect((await newClient().post('/api/auth/logout')).status).toBe(200)
    })

    it('14일이 지나면 세션이 만료되어 401 이고 DB 에서도 지워진다', async () => {
      const target = await ctx.createHousehold()
      const client = newClient()
      await client.post('/api/auth/login', { email: target.email, password: target.password })
      expect((await client.get('/api/auth/me')).status).toBe(200)

      ctx.clock.advance(15 * DAY_MS)
      expect((await client.get('/api/auth/me')).status).toBe(401)
      expect(await ctx.prisma.session.count({ where: { guardianId: target.guardianId } })).toBe(0)
    })

    it('purgeExpired 는 만료된 세션만 지운다', async () => {
      const target = await ctx.createHousehold()
      const client = newClient()
      await client.post('/api/auth/login', { email: target.email, password: target.password })

      // 앞선 테스트들이 시계를 돌려 둔 탓에 남은 만료 세션을 먼저 정리한다.
      await ctx.services.sessions.purgeExpired()
      // 아직 유효한 세션은 지우지 않는다.
      expect(await ctx.services.sessions.purgeExpired()).toBe(0)
      expect(await ctx.prisma.session.count({ where: { guardianId: target.guardianId } })).toBe(1)

      ctx.clock.advance(15 * DAY_MS)
      expect(await ctx.services.sessions.purgeExpired()).toBeGreaterThanOrEqual(1)
      expect(await ctx.prisma.session.count({ where: { guardianId: target.guardianId } })).toBe(0)
    })
  })

  describe('출처 검사 (CSRF 방어)', () => {
    it('허용되지 않은 출처에서 온 POST 는 403 이다', async () => {
      const client = new TestClient(ctx.baseUrl, 'https://evil.example')
      const res = await client.post('/api/auth/login', {
        email: guardian.email,
        password: guardian.password,
      })
      expect(res.status).toBe(403)
      expect((await errorOf(res)).code).toBe('FORBIDDEN')
      expect(client.cookie).toBeUndefined()
    })

    it('브라우저가 cross-site 로 표시한 요청도 거부한다', async () => {
      const client = new TestClient(ctx.baseUrl, null)
      const res = await client.post(
        '/api/auth/login',
        { email: guardian.email, password: guardian.password },
        { 'Sec-Fetch-Site': 'cross-site' },
      )
      expect(res.status).toBe(403)
    })

    it('GET 은 출처와 무관하게 허용한다 (읽기 전용)', async () => {
      const client = new TestClient(ctx.baseUrl, 'https://evil.example')
      expect((await client.get('/api/auth/me')).status).toBe(401)
    })
  })
})

describe('인증 API — 운영 설정', () => {
  it('COOKIE_SECURE 가 켜져 있으면 쿠키에 Secure 속성이 붙는다', async () => {
    const ctx = await createTestContext({ env: { COOKIE_SECURE: true } })
    try {
      const user = await ctx.createHousehold()
      const res = await new TestClient(ctx.baseUrl).post('/api/auth/login', {
        email: user.email,
        password: user.password,
      })
      expect(res.headers.getSetCookie().join('\n')).toContain('Secure')
    } finally {
      await ctx.close()
    }
  })
})
