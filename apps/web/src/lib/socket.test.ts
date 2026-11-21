import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SocketModule from './socket'

/**
 * 실시간 연결 기록(재연결 횟수·마지막 연결 시각·마지막 오류). 테스트 설정은 '@/lib/socket' 을 대역으로 바꿔 두므로
 * 여기서는 실제 모듈을 불러온다. 실제 서버에는 연결하지 않고, 소켓의 이벤트를 흉내 낸다.
 */
type Handler = (...args: unknown[]) => void

function fakeTarget() {
  const handlers = new Map<string, Handler>()
  const managerHandlers = new Map<string, Handler>()
  return {
    on(event: string, handler: Handler) {
      handlers.set(event, handler)
      return this
    },
    io: {
      on(event: string, handler: Handler) {
        managerHandlers.set(event, handler)
        return this
      },
    },
    fire: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args),
    fireManager: (event: string, ...args: unknown[]) => managerHandlers.get(event)?.(...args),
  }
}

async function load() {
  const actual = await vi.importActual<typeof SocketModule>('./socket')
  actual.resetSocketInfo()
  const target = fakeTarget()
  let tick = 0
  actual.trackSocket(target as never, () => new Date(Date.UTC(2026, 10, 17, 0, 0, (tick += 1))))
  return { actual, target }
}

describe('실시간 연결 기록', () => {
  let ctx: Awaited<ReturnType<typeof load>>
  beforeEach(async () => {
    ctx = await load()
  })

  it('처음에는 연결 전(idle)이고 기록이 비어 있다', () => {
    expect(ctx.actual.getSocketInfo()).toEqual({
      status: 'idle',
      reconnectAttempts: 0,
      reconnectCount: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastError: null,
    })
  })

  it('처음 연결은 재연결로 세지 않고, 마지막 연결 시각을 남긴다', () => {
    ctx.target.fire('connect')
    const info = ctx.actual.getSocketInfo()
    expect(info).toMatchObject({ status: 'connected', reconnectCount: 0, reconnectAttempts: 0 })
    expect(info.lastConnectedAt).toBeInstanceOf(Date)
  })

  it('끊긴 뒤 재연결을 시도하면 시도 횟수가 늘고, 연결 실패 이유를 남긴다', () => {
    ctx.target.fire('connect')
    ctx.target.fire('disconnect')
    expect(ctx.actual.getSocketInfo()).toMatchObject({ status: 'disconnected' })
    expect(ctx.actual.getSocketInfo().lastDisconnectedAt).toBeInstanceOf(Date)

    ctx.target.fireManager('reconnect_attempt', 1)
    ctx.target.fire('connect_error', new Error('서버가 응답하지 않습니다'))
    ctx.target.fireManager('reconnect_attempt', 2)
    expect(ctx.actual.getSocketInfo()).toMatchObject({
      status: 'connecting',
      reconnectAttempts: 2,
      lastError: '서버가 응답하지 않습니다',
    })
  })

  it('다시 연결에 성공하면 성공 횟수가 늘고, 시도 횟수와 오류가 초기화되며, 마지막 연결 시각이 갱신된다', () => {
    ctx.target.fire('connect')
    const firstAt = ctx.actual.getSocketInfo().lastConnectedAt
    ctx.target.fire('disconnect')
    ctx.target.fireManager('reconnect_attempt', 1)
    ctx.target.fire('connect_error', new Error('실패'))
    ctx.target.fire('connect')
    const info = ctx.actual.getSocketInfo()
    expect(info).toMatchObject({
      status: 'connected',
      reconnectCount: 1,
      reconnectAttempts: 0,
      lastError: null,
    })
    expect(info.lastConnectedAt!.getTime()).toBeGreaterThan(firstAt!.getTime())

    ctx.target.fire('disconnect')
    ctx.target.fire('connect')
    expect(ctx.actual.getSocketInfo().reconnectCount).toBe(2)
  })

  it('같은 오류가 되풀이되어 바뀐 것이 없으면 구독자에게 다시 알리지 않는다', () => {
    const listener = vi.fn()
    const off = ctx.actual.subscribeSocketStatus(listener)
    ctx.target.fire('connect_error', new Error('연결 실패'))
    expect(listener).toHaveBeenCalledTimes(1)
    const before = ctx.actual.getSocketInfo()
    ctx.target.fire('connect_error', new Error('연결 실패'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(ctx.actual.getSocketInfo()).toBe(before)
    off()
  })
})
