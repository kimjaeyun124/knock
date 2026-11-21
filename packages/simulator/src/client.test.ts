import { describe, expect, it, vi } from 'vitest'
import { IngestClient, IngestError } from './client'
import { runCli } from './cli-core'

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    Promise.resolve(
      handler(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        init ?? {},
      ),
    ),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('IngestClient', () => {
  it('Bearer 토큰과 JSON 본문으로 이벤트를 보내고 응답을 해석한다', async () => {
    const fetchMock = fakeFetch(() =>
      json({
        serverTime: '2026-11-14T03:00:00.000Z',
        results: [{ eventId: 'evt-00000001', status: 'ACCEPTED' }],
      }),
    )
    const client = new IngestClient({ baseUrl: 'http://x/', token: 'tsn_abc', fetch: fetchMock })
    const res = await client.sendMotion({ eventId: 'evt-00000001' })
    expect(res.results[0]?.status).toBe('ACCEPTED')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://x/api/ingest/v1/events')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tsn_abc')
    expect(JSON.parse(init.body as string)).toEqual({
      events: [{ eventId: 'evt-00000001', type: 'MOTION' }],
    })
  })

  it('count 만큼 서로 다른 ID 의 이벤트를 만든다', async () => {
    const fetchMock = fakeFetch(() => json({ serverTime: '2026-11-14T03:00:00.000Z', results: [] }))
    const client = new IngestClient({ baseUrl: 'http://x', token: 't', fetch: fetchMock })
    await client.sendMotion({ count: 3 })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const ids = (JSON.parse(init.body as string) as { events: { eventId: string }[] }).events.map(
      (e) => e.eventId,
    )
    expect(new Set(ids).size).toBe(3)
  })

  it('서버의 오류 응답은 한국어 메시지와 코드를 담은 IngestError 가 된다', async () => {
    const fetchMock = fakeFetch(() =>
      json(
        { error: { code: 'UNAUTHORIZED', message: '장치 토큰이 없거나 올바르지 않습니다.' } },
        401,
      ),
    )
    const client = new IngestClient({ baseUrl: 'http://x', token: 't', fetch: fetchMock })
    await expect(client.sendHeartbeat()).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: '장치 토큰이 없거나 올바르지 않습니다.',
    })
  })

  it('서버에 닿지 못하면 status 0 의 IngestError', async () => {
    const fetchMock = fakeFetch(() => {
      throw new TypeError('fetch failed')
    })
    const client = new IngestClient({ baseUrl: 'http://x', token: 't', fetch: fetchMock })
    const error = await client.sendHeartbeat().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestError)
    expect((error as IngestError).status).toBe(0)
  })

  it('성공 응답이라도 계약과 다르면 오류로 취급한다', async () => {
    const fetchMock = fakeFetch(() => json({ ok: true }))
    const client = new IngestClient({ baseUrl: 'http://x', token: 't', fetch: fetchMock })
    await expect(client.sendHeartbeat()).rejects.toThrow('수집 계약과 다릅니다')
  })
})

describe('runCli', () => {
  const collect = () => {
    const out: string[] = []
    const err: string[] = []
    return { out, err, io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) } }
  }

  it('토큰이 없으면 사용법 오류(2)', async () => {
    const c = collect()
    expect(await runCli(['event'], {}, c.io)).toBe(2)
    expect(c.err.join('')).toContain('장치 토큰이 필요합니다')
  })

  it('환경변수의 토큰으로 heartbeat 를 보낸다', async () => {
    const fetchMock = fakeFetch(() => json({ serverTime: '2026-11-14T03:00:00.000Z' }))
    const c = collect()
    const code = await runCli(
      ['heartbeat', '--battery', '55'],
      { TETRIS_DEVICE_TOKEN: 'tsn_env' },
      c.io,
      { fetch: fetchMock },
    )
    expect(code).toBe(0)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tsn_env')
    expect(JSON.parse(init.body as string)).toEqual({ batteryPercent: 55 })
  })

  it('범위를 벗어난 옵션은 서버에 요청하지 않고 거부한다', async () => {
    const fetchMock = fakeFetch(() => json({}))
    const c = collect()
    expect(
      await runCli(['heartbeat', '--battery', '150', '--token', 't'], {}, c.io, {
        fetch: fetchMock,
      }),
    ).toBe(2)
    expect(
      await runCli(['event', '--count', '0', '--token', 't'], {}, c.io, { fetch: fetchMock }),
    ).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('거부된 이벤트가 있으면 종료 코드 1', async () => {
    const fetchMock = fakeFetch(() =>
      json({
        serverTime: '2026-11-14T03:00:00.000Z',
        results: [{ eventId: 'evt-00000001', status: 'REJECTED', reason: 'FUTURE_TIMESTAMP' }],
      }),
    )
    const c = collect()
    expect(await runCli(['event', '--token', 't'], {}, c.io, { fetch: fetchMock })).toBe(1)
    expect(c.out.join('')).toContain('REJECTED (FUTURE_TIMESTAMP)')
  })

  it('알 수 없는 명령과 옵션은 사용법을 보여 준다', async () => {
    const c = collect()
    expect(await runCli(['dance'], {}, c.io)).toBe(2)
    expect(await runCli(['event', '--nope'], {}, c.io)).toBe(2)
    expect(c.err.join('')).toContain('사용법')
  })
})
