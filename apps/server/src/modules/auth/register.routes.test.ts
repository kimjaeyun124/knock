import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  AuthSessionResponseSchema,
  DEFAULT_DETECTION_SETTINGS,
  SetupStatusResponseSchema,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

const valid = {
  email: 'First@Example.com',
  password: 'a-long-enough-password',
  displayName: '첫 보호자',
}

describe('첫 계정 만들기 (register)', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })
  const client = () => new TestClient(ctx.baseUrl)
  const needsSetup = async () =>
    SetupStatusResponseSchema.parse(await (await client().get('/api/auth/setup-status')).json())
      .needsSetup

  it('보호자가 없으면 설정이 필요하다고 알리고, 잘못된 입력은 계정을 만들지 않는다', async () => {
    expect(await needsSetup()).toBe(true)
    for (const body of [
      { ...valid, password: 'short' },
      { ...valid, email: 'not-an-email' },
      { ...valid, displayName: '  ' },
      {},
    ]) {
      expect((await client().post('/api/auth/register', body)).status).toBe(400)
    }
    expect(await ctx.prisma.guardian.count()).toBe(0)
  })

  it('가구·보호자·기본 설정을 만들고 바로 로그인시킨다', async () => {
    const c = client()
    const res = await c.post('/api/auth/register', valid)
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = AuthSessionResponseSchema.parse(await res.json())
    expect(body.guardian.email).toBe('first@example.com')
    expect(body.household.recipientAlias).toBe('어르신')
    expect(JSON.stringify(body)).not.toContain('passwordHash')

    expect((await c.get('/api/auth/me')).status).toBe(200) // 쿠키가 설정됨
    const settings = await ctx.prisma.detectionSettings.findUniqueOrThrow({
      where: { householdId: body.household.id },
    })
    expect(settings.nightStart).toBe(DEFAULT_DETECTION_SETTINGS.nightStart)
    const stored = await ctx.prisma.guardian.findUniqueOrThrow({
      where: { email: 'first@example.com' },
    })
    expect(stored.passwordHash).not.toContain(valid.password)
    expect(await needsSetup()).toBe(false)
  })

  it('보호자가 이미 있으면 더 만들 수 없다 (403)', async () => {
    const res = await client().post('/api/auth/register', { ...valid, email: 'second@example.com' })
    expect(res.status).toBe(403)
    expect(ApiErrorBodySchema.parse(await res.json()).error.message).toContain('이미 설정된 서버')
    expect(await ctx.prisma.guardian.count()).toBe(1)
  })

  it('만든 계정으로 다시 로그인할 수 있다', async () => {
    const res = await client().post('/api/auth/login', {
      email: valid.email,
      password: valid.password,
    })
    expect(res.status).toBe(200)
  })

  it('허용되지 않은 출처의 요청은 403 이다', async () => {
    const res = await client().post('/api/auth/register', valid, { Origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })
})

describe('첫 계정 만들기: 동시 요청', () => {
  it('동시에 두 번 요청해도 계정은 하나만 만들어진다', async () => {
    const ctx = await createTestContext()
    try {
      const results = await Promise.all(
        [1, 2, 3].map((n) =>
          new TestClient(ctx.baseUrl).post('/api/auth/register', {
            ...valid,
            email: `race${n}@example.com`,
          }),
        ),
      )
      expect(results.map((r) => r.status).sort()).toEqual([201, 403, 403])
      expect(await ctx.prisma.guardian.count()).toBe(1)
    } finally {
      await ctx.close()
    }
  })
})
