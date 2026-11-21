import { describe, expect, it, vi } from 'vitest'
import { runCli } from './cli-core'

const ZONES = ['BED_SIDE', 'PATH', 'ENTRANCE']

function state(overrides: Record<string, unknown> = {}) {
  return {
    sensors: ZONES.map((zone) => ({ zone, sensor: null, silenced: false, batteryPercent: null })),
    running: null,
    lastRun: null,
    deliveryFailure: { enabled: false, expiresAt: null },
    night: { start: '22:00', end: '06:00', isNightNow: true, sensitivity: 'MEDIUM' },
    ...overrides,
  }
}
const running = {
  scenarioId: 'entrance',
  speed: 1,
  startedAt: '2026-11-14T17:00:00.000Z',
  completedSteps: 0,
  totalSteps: 1,
}
const SESSION = {
  guardian: { id: 'g', email: 'a@example.com', displayName: '보호자' },
  household: { id: 'h', name: '가구', recipientAlias: null },
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function setup(
  handler: (method: string, path: string, body: unknown, cookie: string | null) => Response,
) {
  const calls: { method: string; path: string; body: unknown; cookie: string | null }[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const cookie = (init?.headers as Record<string, string> | undefined)?.Cookie ?? null
    calls.push({ method: init?.method ?? 'GET', path, body, cookie })
    return Promise.resolve(handler(init?.method ?? 'GET', path, body, cookie))
  }) as unknown as typeof fetch
  const out: string[] = []
  const err: string[] = []
  return {
    calls,
    fetch: fetchMock,
    out,
    err,
    io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) },
  }
}
const ENV = { TETRIS_EMAIL: 'a@example.com', TETRIS_PASSWORD: 'pw-for-tests-only' }

describe('시뮬레이터 CLI 명령', () => {
  it('scenarios 는 서버에 연결하지 않고 6개 시나리오를 보여 준다', async () => {
    const t = setup(() => json({}))
    expect(await runCli(['scenarios'], {}, t.io, { fetch: t.fetch })).toBe(0)
    expect(t.calls).toHaveLength(0)
    expect(t.out.join('')).toContain('entrance')
    expect(t.out.join('')).toContain('delivery-failure')
  })

  it('계정 정보가 없으면 로그인하지 않고 사용법 오류(2)', async () => {
    const t = setup(() => json({}))
    expect(await runCli(['scenario', 'entrance'], {}, t.io, { fetch: t.fetch })).toBe(2)
    expect(t.err.join('')).toContain('TETRIS_PASSWORD')
    expect(t.calls).toHaveLength(0)
  })

  it.each([
    [['scenario'], '시나리오 id'],
    [['scenario', 'nope'], '시나리오 id'],
    [['scenario', 'entrance', '--speed', '5'], '--speed'],
    [['motion', 'KITCHEN'], 'zone'],
    [['fault', 'maybe'], 'on 또는 off'],
  ])('잘못된 입력 %j 은 서버에 닿기 전에 거절한다', async (argv, message) => {
    const t = setup(() => json({}))
    expect(await runCli(argv, ENV, t.io, { fetch: t.fetch })).toBe(2)
    expect(t.err.join('')).toContain(message)
    expect(t.calls).toHaveLength(0)
  })

  it('로그인 쿠키를 이어서 보내고 시나리오 재생을 요청한다', async () => {
    const t = setup((_method, path) =>
      path === '/api/auth/login'
        ? json(SESSION, 200, { 'Set-Cookie': 'tetris_session=abc; Path=/; HttpOnly' })
        : json(state({ running })),
    )
    const code = await runCli(['scenario', 'entrance', '--speed', '10'], ENV, t.io, {
      fetch: t.fetch,
    })
    expect(code).toBe(0)
    expect(t.calls[0]).toMatchObject({ path: '/api/auth/login', body: { email: 'a@example.com' } })
    expect(t.calls[1]).toMatchObject({
      method: 'POST',
      path: '/api/dev/simulator/scenarios/entrance/run',
      body: { speed: 10 },
      cookie: 'tetris_session=abc',
    })
    expect(t.out.join('')).toContain('10배속')
  })

  it('야간이 아니면 알림이 만들어지지 않는다고 미리 알린다', async () => {
    const t = setup((_m, path) =>
      path === '/api/auth/login'
        ? json(SESSION)
        : json(
            state({
              night: { start: '22:00', end: '06:00', isNightNow: false, sensitivity: 'MEDIUM' },
            }),
          ),
    )
    await runCli(['scenario', 'entrance'], ENV, t.io, { fetch: t.fetch })
    expect(t.out.join('')).toContain('야간 시간대가 아니어서')
  })

  it('--wait 는 재생이 끝날 때까지 기다리고 성공이면 0', async () => {
    let polls = 0
    const t = setup((_m, path) => {
      if (path === '/api/auth/login') return json(SESSION)
      if (path.endsWith('/run')) return json(state({ running }))
      polls += 1
      return json(
        polls < 3
          ? state({ running })
          : state({
              lastRun: {
                scenarioId: 'entrance',
                endedAt: '2026-11-14T17:00:05.000Z',
                outcome: 'COMPLETED',
                error: null,
              },
            }),
      )
    })
    const sleeps: number[] = []
    const code = await runCli(['scenario', 'entrance', '--wait'], ENV, t.io, {
      fetch: t.fetch,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
    })
    expect(code).toBe(0)
    expect(sleeps).toHaveLength(3)
    expect(t.out.join('')).toContain('재생이 끝났습니다')
  })

  it('--wait 중 재생이 실패하면 이유와 함께 종료 코드 1', async () => {
    const t = setup((_m, path) => {
      if (path === '/api/auth/login') return json(SESSION)
      if (path.endsWith('/run')) return json(state({ running }))
      return json(
        state({
          lastRun: {
            scenarioId: 'entrance',
            endedAt: '2026-11-14T17:00:05.000Z',
            outcome: 'FAILED',
            error: '수집 API 에 신호를 보내지 못했습니다.',
          },
        }),
      )
    })
    const code = await runCli(['scenario', 'entrance', '--wait'], ENV, t.io, {
      fetch: t.fetch,
      sleep: () => Promise.resolve(),
    })
    expect(code).toBe(1)
    expect(t.err.join('')).toContain('수집 API 에 신호를 보내지 못했습니다.')
  })

  it('시뮬레이터가 꺼져 있으면(404) 원인을 짚어 준다', async () => {
    const t = setup((_m, path) =>
      path === '/api/auth/login'
        ? json(SESSION)
        : json({ error: { code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' } }, 404),
    )
    expect(await runCli(['scenario', 'entrance'], ENV, t.io, { fetch: t.fetch })).toBe(1)
    expect(t.err.join('')).toContain('SIMULATOR_ENABLED')
  })

  it('로그인 실패는 서버 메시지와 함께 종료 코드 1', async () => {
    const t = setup(() =>
      json(
        { error: { code: 'UNAUTHORIZED', message: '이메일 또는 비밀번호가 올바르지 않습니다.' } },
        401,
      ),
    )
    expect(await runCli(['cleanup'], ENV, t.io, { fetch: t.fetch })).toBe(1)
    expect(t.err.join('')).toContain('이메일 또는 비밀번호가 올바르지 않습니다.')
  })

  it('motion·fault·cleanup 이 알맞은 API 를 부른다', async () => {
    const t = setup((_m, path) => {
      if (path === '/api/auth/login') return json(SESSION)
      if (path === '/api/data/simulated')
        return json({ ok: true, deleted: { sensors: 3, events: 2, alerts: 1 } })
      return json(
        state({ deliveryFailure: { enabled: true, expiresAt: '2026-11-14T17:10:00.000Z' } }),
      )
    })
    expect(await runCli(['motion', 'PATH'], ENV, t.io, { fetch: t.fetch })).toBe(0)
    expect(await runCli(['fault', 'on'], ENV, t.io, { fetch: t.fetch })).toBe(0)
    expect(await runCli(['cleanup'], ENV, t.io, { fetch: t.fetch })).toBe(0)
    const paths = t.calls
      .filter((c) => c.path !== '/api/auth/login')
      .map((c) => `${c.method} ${c.path}`)
    expect(paths).toEqual([
      'POST /api/dev/simulator/motion',
      'POST /api/dev/simulator/faults',
      'DELETE /api/data/simulated',
    ])
    expect(t.out.join('')).toContain('센서 3, 기록 2, 알림 1')
  })
})

describe('demo 명령 (시연 준비·상태)', () => {
  const summary = (simulated: number, real: number) => ({
    simulated: { sensors: simulated, events: simulated * 3, alerts: simulated },
    real: { sensors: real, events: real * 3, alerts: real },
  })

  function demoServer(options: { night: boolean }) {
    return setup((method, path) => {
      if (path === '/api/auth/login')
        return json(SESSION, 200, { 'Set-Cookie': 'tetris_session=abc; Path=/; HttpOnly' })
      if (method === 'DELETE' && path === '/api/data/simulated')
        return json({ ok: true, deleted: { sensors: 3, events: 9, alerts: 2 } })
      if (method === 'POST' && path === '/api/dev/simulator/sensors') return json(state())
      if (path === '/api/data/summary') return json(summary(3, 1))
      if (path === '/api/dev/simulator/state')
        return json(
          state({
            night: {
              start: '22:00',
              end: '06:00',
              isNightNow: options.night,
              sensitivity: 'MEDIUM',
            },
          }),
        )
      return json({ error: { code: 'NOT_FOUND', message: '없음' } }, 404)
    })
  }

  it('reset 은 시뮬레이션 데이터만 지우고 센서를 다시 연결하며, 남은 실제 데이터 수를 보여 준다', async () => {
    const t = demoServer({ night: true })
    expect(await runCli(['demo', 'reset'], ENV, t.io, { fetch: t.fetch })).toBe(0)
    const calls = t.calls.map((c) => `${c.method} ${c.path}`)
    // 실제 데이터를 지우는 호출은 없다: 지우기는 시뮬레이션 전용 경로 하나뿐
    expect(calls.filter((c) => c.startsWith('DELETE'))).toEqual(['DELETE /api/data/simulated'])
    expect(calls).toContain('POST /api/dev/simulator/sensors')
    const out = t.out.join('')
    expect(out).toContain('센서 3, 기록 9, 알림 2')
    expect(out).toContain('실제 데이터(건드리지 않음): 센서 1, 기록 3, 알림 1')
    expect(out).toContain('야간 시간대입니다')
  })

  it('status 는 아무것도 바꾸지 않고, 야간이 아니면 알림이 만들어지지 않는다고 알린다', async () => {
    const t = demoServer({ night: false })
    expect(await runCli(['demo', 'status'], ENV, t.io, { fetch: t.fetch })).toBe(0)
    expect(
      t.calls.some(
        (c) => c.method === 'DELETE' || (c.method === 'POST' && c.path !== '/api/auth/login'),
      ),
    ).toBe(false)
    expect(t.out.join('')).toContain('알림은 만들어지지 않습니다')
  })

  it('reset·status 가 아니면 서버에 닿기 전에 거절한다', async () => {
    const t = demoServer({ night: true })
    expect(await runCli(['demo', 'wipe'], ENV, t.io, { fetch: t.fetch })).toBe(2)
    expect(t.calls).toHaveLength(0)
  })

  it('시뮬레이터가 꺼진 서버(운영)에서는 실패로 끝난다', async () => {
    const t = setup((_m, path) =>
      path === '/api/auth/login'
        ? json(SESSION)
        : path === '/api/data/simulated'
          ? json({ ok: true, deleted: { sensors: 0, events: 0, alerts: 0 } })
          : json({ error: { code: 'NOT_FOUND', message: '찾을 수 없습니다.' } }, 404),
    )
    expect(await runCli(['demo', 'reset'], ENV, t.io, { fetch: t.fetch })).toBe(1)
    expect(t.err.join('')).toContain('SIMULATOR_ENABLED')
  })
})
