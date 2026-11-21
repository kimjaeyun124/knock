import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '@/config/env'
import { LivenessPinger } from './liveness-pinger'

const logger = pino({ level: 'silent' })
const URL_WITH_TOKEN = 'https://hc-ping.example/abc-secret-token'

describe('LivenessPinger — 외부 감시 신호', () => {
  it('서버가 건강하면 감시 주소로 GET 한 번을 보낸다 (본문 없음)', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('OK')))
    const pinger = new LivenessPinger({
      url: URL_WITH_TOKEN,
      check: () => Promise.resolve(),
      logger,
      fetchImpl,
    })
    expect(await pinger.ping()).toBe('SENT')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(URL_WITH_TOKEN)
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
  })

  it('서버가 건강하지 않으면(DB 불가·주기 점검 정지 등) 신호를 보내지 않아 외부 감시가 경고하게 한다', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('OK')))
    const pinger = new LivenessPinger({
      url: URL_WITH_TOKEN,
      check: () => Promise.reject(new Error('DB 접근 실패')),
      logger,
      fetchImpl,
    })
    expect(await pinger.ping()).toBe('UNHEALTHY')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('감시 서비스가 오류·타임아웃이어도 던지지 않고 실패로만 알린다', async () => {
    const down = new LivenessPinger({
      url: URL_WITH_TOKEN,
      check: () => Promise.resolve(),
      logger,
      fetchImpl: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    })
    expect(await down.ping()).toBe('FAILED')
    const bad = new LivenessPinger({
      url: URL_WITH_TOKEN,
      check: () => Promise.resolve(),
      logger,
      fetchImpl: vi.fn(() => Promise.resolve(new Response('no', { status: 500 }))),
    })
    expect(await bad.ping()).toBe('FAILED')
  })

  it('로그에는 주소의 비밀 토큰을 남기지 않는다 (호스트만)', async () => {
    const lines: string[] = []
    const capture = pino({ level: 'warn' }, { write: (line: string) => void lines.push(line) })
    const pinger = new LivenessPinger({
      url: URL_WITH_TOKEN,
      check: () => Promise.resolve(),
      logger: capture,
      fetchImpl: vi.fn(() => Promise.reject(new Error(`failed ${URL_WITH_TOKEN}`))),
    })
    await pinger.ping()
    const logged = lines.join('')
    expect(logged).toContain('hc-ping.example')
    expect(logged).not.toContain('abc-secret-token')
  })

  it('환경변수: 지정하지 않으면 꺼져 있고, https 만 받는다', () => {
    expect(loadEnv({}).HEARTBEAT_PING_URL).toBeUndefined()
    expect(loadEnv({ HEARTBEAT_PING_URL: URL_WITH_TOKEN }).HEARTBEAT_PING_URL).toBe(URL_WITH_TOKEN)
    expect(() => loadEnv({ HEARTBEAT_PING_URL: 'http://hc.example/x' })).toThrow('https://')
    expect(loadEnv({}).HEARTBEAT_PING_INTERVAL_SECONDS).toBe(60)
    expect(() => loadEnv({ HEARTBEAT_PING_INTERVAL_SECONDS: '5' })).toThrow()
  })
})

describe('주기 점검의 마지막 실행 시각 (외부 감시 신호의 건강 기준)', () => {
  it('아직 돌지 않았으면 null, 한 번 돌고 나면 그 시각', async () => {
    const { createTestContext } = await import('@/test-utils/context')
    const ctx = await createTestContext()
    try {
      expect(ctx.services.maintenance.lastTickAt()).toBeNull()
      await ctx.services.maintenance.tick()
      expect(ctx.services.maintenance.lastTickAt()?.getTime()).toBe(ctx.clock.now().getTime())
    } finally {
      await ctx.close()
    }
  })
})
