import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ServerReadyPayload } from '@tetris/shared'
import { householdRoom } from '@/realtime/socket'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient, WEB_ORIGIN } from '@/test-utils/http'

describe('실시간 연결 인증', () => {
  let ctx: TestContext
  const opened: Socket[] = []

  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })
  afterEach(() => {
    opened.splice(0).forEach((socket) => socket.close())
  })

  function open(headers: Record<string, string>): Socket {
    const socket = connect(ctx.baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: headers,
    })
    opened.push(socket)
    return socket
  }

  const once = <T>(socket: Socket, event: string): Promise<T> =>
    new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)))

  async function loginCookie(): Promise<{ cookie: string; householdId: string; token: string }> {
    const user = await ctx.createHousehold()
    const client = new TestClient(ctx.baseUrl)
    await client.post('/api/auth/login', { email: user.email, password: user.password })
    const cookie = client.cookie ?? ''
    return { cookie, householdId: user.householdId, token: cookie.split('=')[1] ?? '' }
  }

  it('로그인한 보호자는 연결되고 server:ready 를 받는다', async () => {
    const { cookie } = await loginCookie()
    const socket = open({ Cookie: cookie, Origin: WEB_ORIGIN })
    const payload = await once<ServerReadyPayload>(socket, 'server:ready')
    expect(Date.parse(payload.serverTime)).not.toBeNaN()
  })

  it('로그인 쿠키가 없으면 연결을 거부한다', async () => {
    const socket = open({ Origin: WEB_ORIGIN })
    const error = await once<Error>(socket, 'connect_error')
    expect(error.message).toBe('UNAUTHORIZED')
  })

  it('엉터리 세션 쿠키는 거부한다', async () => {
    const socket = open({ Cookie: 'tetris_session=forged', Origin: WEB_ORIGIN })
    expect((await once<Error>(socket, 'connect_error')).message).toBe('UNAUTHORIZED')
  })

  it('허용되지 않은 출처의 웹소켓 연결은 올바른 쿠키가 있어도 거부한다', async () => {
    const { cookie } = await loginCookie()
    const socket = open({ Cookie: cookie, Origin: 'https://evil.example' })
    await once<Error>(socket, 'connect_error')
    expect(socket.connected).toBe(false)
  })

  it('연결된 소켓은 자기 가구의 방에만 들어간다', async () => {
    const mine = await loginCookie()
    const other = await loginCookie()
    const socket = open({ Cookie: mine.cookie, Origin: WEB_ORIGIN })
    await once(socket, 'server:ready')

    const rooms = await ctx.io.in(householdRoom(mine.householdId)).fetchSockets()
    expect(rooms).toHaveLength(1)
    const otherRooms = await ctx.io.in(householdRoom(other.householdId)).fetchSockets()
    expect(otherRooms).toHaveLength(0)
  })

  it('로그아웃하면 그 세션의 실시간 연결이 끊어진다', async () => {
    const user = await ctx.createHousehold()
    const client = new TestClient(ctx.baseUrl)
    await client.post('/api/auth/login', { email: user.email, password: user.password })

    const socket = open({ Cookie: client.cookie ?? '', Origin: WEB_ORIGIN })
    await once(socket, 'server:ready')
    const disconnected = once<string>(socket, 'disconnect')

    await client.post('/api/auth/logout')
    expect(await disconnected).toBe('io server disconnect')
  })
})
