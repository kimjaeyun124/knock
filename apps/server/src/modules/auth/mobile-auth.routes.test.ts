import { io as connect } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MobileLoginResponseSchema } from '@tetris/shared'
import { LOGIN_MAX_FAILURES } from '@/config/auth'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'

/** 휴대폰 앱처럼: 쿠키도 Origin 도 없이, Bearer 토큰으로만 부른다. */
function asApp(ctx: TestContext, token?: string) {
  return (path: string, init: { method?: string; body?: unknown } = {}) =>
    fetch(`${ctx.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
}

describe('휴대폰 앱 로그인 (Bearer 토큰)', () => {
  let ctx: TestContext
  let me: TestHousehold
  let other: TestHousehold
  const PASSWORD = 'app-password-1234'

  beforeAll(async () => {
    ctx = await createTestContext()
    me = await ctx.createHousehold({ email: 'app@example.com', password: PASSWORD })
    other = await ctx.createHousehold()
  })
  afterAll(async () => {
    await ctx.close()
  })

  async function login(email = me.email, password = PASSWORD) {
    return asApp(ctx)('/api/auth/mobile/login', { method: 'POST', body: { email, password } })
  }

  it('로그인하면 쿠키 없이 토큰과 보호자·가구 정보를 돌려준다', async () => {
    const res = await login()
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = MobileLoginResponseSchema.parse(await res.json())
    expect(body.guardian.email).toBe(me.email)
    expect(body.household.id).toBe(me.householdId)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('토큰으로 내 데이터를 읽고, 다른 가구의 것은 읽지 못한다', async () => {
    const { token } = MobileLoginResponseSchema.parse(await (await login()).json())
    const app = asApp(ctx, token)
    const meRes = await app('/api/auth/me')
    expect(meRes.status).toBe(200)
    expect(((await meRes.json()) as { guardian: { email: string } }).guardian.email).toBe(me.email)
    expect((await app('/api/alerts')).status).toBe(200)

    const theirs = await ctx.prisma.alert.create({
      data: {
        householdId: other.householdId,
        type: 'ENTRANCE_APPROACH',
        severity: 'URGENT',
        origin: 'REAL',
        title: '현관 근처에서 움직임이 감지되었습니다',
        message: '확인해 주세요.',
        triggeredAt: new Date(),
        dedupeKey: 'mobile-test',
      },
    })
    expect((await app(`/api/alerts/${theirs.id}`)).status).toBe(404)
  })

  it('토큰으로 알림을 확인 처리할 수 있다 (쿠키·Origin 없는 앱 요청도 받는다)', async () => {
    const { token } = MobileLoginResponseSchema.parse(await (await login()).json())
    const alert = await ctx.prisma.alert.create({
      data: {
        householdId: me.householdId,
        type: 'ENTRANCE_APPROACH',
        severity: 'URGENT',
        origin: 'REAL',
        title: '현관 근처에서 움직임이 감지되었습니다',
        message: '확인해 주세요.',
        triggeredAt: new Date(),
        dedupeKey: 'mobile-ack',
      },
    })
    const res = await asApp(ctx, token)(`/api/alerts/${alert.id}/acknowledge`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)
  })

  it('토큰이 없거나 틀리거나 형식이 이상하면 401 이다', async () => {
    expect((await asApp(ctx)('/api/alerts')).status).toBe(401)
    expect((await asApp(ctx, 'x'.repeat(43))('/api/alerts')).status).toBe(401)
    const weird = await fetch(`${ctx.baseUrl}/api/alerts`, {
      headers: { Authorization: 'Bearer ../../etc' },
    })
    expect(weird.status).toBe(401)
  })

  it('로그아웃하면 그 토큰은 더 이상 쓰이지 않는다', async () => {
    const { token } = MobileLoginResponseSchema.parse(await (await login()).json())
    const app = asApp(ctx, token)
    expect((await app('/api/auth/logout', { method: 'POST', body: {} })).status).toBe(200)
    expect((await app('/api/auth/me')).status).toBe(401)
  })

  it('비밀번호가 틀리면 401 이고, 같은 시도 제한(5회)이 적용된다', async () => {
    const victim = await ctx.createHousehold({ email: 'app-throttle@example.com' })
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      expect((await login(victim.email, 'wrong-password-000')).status).toBe(401)
    }
    expect((await login(victim.email, victim.password)).status).toBe(429)
  })

  it('실시간 연결도 auth.token 으로 인증하고, 내 가구의 알림만 받는다', async () => {
    const { token } = MobileLoginResponseSchema.parse(await (await login()).json())
    const socket = connect(ctx.baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token },
    })
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('server:ready', () => resolve())
        socket.once('connect_error', (error) => reject(error))
      })
      const received: string[] = []
      socket.on('alert.created', (payload: { alert: { id: string } }) => {
        received.push(payload.alert.id)
      })
      ctx.services.realtime.emitToHousehold(me.householdId, 'alert.created', {
        alert: { id: 'mine' },
      } as never)
      ctx.services.realtime.emitToHousehold(other.householdId, 'alert.created', {
        alert: { id: 'theirs' },
      } as never)
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(received).toEqual(['mine'])
    } finally {
      socket.close()
    }
  })

  it('실시간 연결에 토큰이 없거나 틀리면 거부한다', async () => {
    for (const auth of [{}, { token: 'y'.repeat(43) }]) {
      const socket = connect(ctx.baseUrl, { transports: ['websocket'], reconnection: false, auth })
      const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve))
      expect(error.message).toBe('UNAUTHORIZED')
      socket.close()
    }
  })
})
