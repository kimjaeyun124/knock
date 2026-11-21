import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema, ChangePasswordResponseSchema } from '@tetris/shared'
import { LOGIN_MAX_FAILURES } from '@/config/auth'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

describe('비밀번호 변경 (POST /api/auth/password)', () => {
  let ctx: TestContext
  let guardian: TestHousehold
  const OLD = 'correct-horse-1'
  const NEW = 'brand-new-secret-9'

  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  async function fresh(email: string) {
    guardian = await ctx.createHousehold({ email, password: OLD })
    return guardian
  }
  const login = async (email: string, password: string) => {
    const client = new TestClient(ctx.baseUrl)
    const res = await client.post('/api/auth/login', { email, password })
    return { client, res }
  }
  const errorOf = async (res: Response) => ApiErrorBodySchema.parse(await res.json()).error

  it('로그인하지 않으면 401 이다', async () => {
    const res = await new TestClient(ctx.baseUrl).post('/api/auth/password', {
      currentPassword: OLD,
      newPassword: NEW,
    })
    expect(res.status).toBe(401)
  })

  it('바꾸면 새 비밀번호로만 로그인되고, 이 기기는 로그인된 채 다른 기기는 끊긴다', async () => {
    const user = await fresh('change@example.com')
    const here = await ctx.loginAs(user)
    const other = (await login(user.email, OLD)).client
    expect((await other.get('/api/auth/me')).status).toBe(200)

    const res = await here.post('/api/auth/password', { currentPassword: OLD, newPassword: NEW })
    expect(res.status).toBe(200)
    const body = ChangePasswordResponseSchema.parse(await res.json())
    expect(body.signedOutOtherSessions).toBeGreaterThanOrEqual(1)

    expect((await here.get('/api/auth/me')).status).toBe(200) // 지금 기기는 그대로
    expect((await other.get('/api/auth/me')).status).toBe(401) // 다른 기기는 끊김
    expect((await login(user.email, OLD)).res.status).toBe(401)
    expect((await login(user.email, NEW)).res.status).toBe(200)
  })

  it('현재 비밀번호가 틀리면 400 이고 아무것도 바뀌지 않는다 (401 이 아니라 화면이 로그아웃되지 않는다)', async () => {
    const user = await fresh('wrong@example.com')
    const client = await ctx.loginAs(user)
    const res = await client.post('/api/auth/password', {
      currentPassword: 'not-my-password',
      newPassword: NEW,
    })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).message).toContain('현재 비밀번호')
    expect((await login(user.email, OLD)).res.status).toBe(200)
    expect((await client.get('/api/auth/me')).status).toBe(200)
  })

  it('새 비밀번호가 짧거나 현재와 같으면 400 이다', async () => {
    const user = await fresh('weak@example.com')
    const client = await ctx.loginAs(user)
    expect(
      (await client.post('/api/auth/password', { currentPassword: OLD, newPassword: 'short' }))
        .status,
    ).toBe(400)
    expect(
      (await client.post('/api/auth/password', { currentPassword: OLD, newPassword: OLD })).status,
    ).toBe(400)
    expect((await login(user.email, OLD)).res.status).toBe(200)
  })

  it('현재 비밀번호를 계속 틀리면 시도가 제한된다 (429)', async () => {
    const user = await fresh('throttle@example.com')
    const client = await ctx.loginAs(user)
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      expect(
        (
          await client.post('/api/auth/password', {
            currentPassword: `wrong-${i}`,
            newPassword: NEW,
          })
        ).status,
      ).toBe(400)
    }
    const blocked = await client.post('/api/auth/password', {
      currentPassword: OLD,
      newPassword: NEW,
    })
    expect(blocked.status).toBe(429)
    expect((await login(user.email, OLD)).res.status).toBe(200) // 바뀌지 않았다
  })

  it('다른 출처에서 온 요청은 403 이고 비밀번호는 바뀌지 않는다', async () => {
    const user = await fresh('origin@example.com')
    const client = await ctx.loginAs(user)
    const res = await client.post(
      '/api/auth/password',
      { currentPassword: OLD, newPassword: NEW },
      { Origin: 'https://evil.example' },
    )
    expect(res.status).toBe(403)
    expect((await login(user.email, OLD)).res.status).toBe(200)
  })
})
