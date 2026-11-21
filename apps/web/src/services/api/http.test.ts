import { buildDashboardSummary } from '@tetris/shared'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../apiClient'
import { createHttpApiClient, toQueryString } from './http'
import { errorResponse, jsonResponse, stubFetch } from '@/test/helpers'
import { DETECTION_SETTINGS, makeAlert, makeSensor } from '@/test/fixtures'

function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit | undefined]
  return { url, method: init?.method ?? 'GET', body: init?.body as string | undefined }
}

describe('toQueryString', () => {
  it('값이 없는 항목은 빼고, 아무것도 없으면 빈 문자열이다', () => {
    expect(toQueryString({})).toBe('')
    expect(toQueryString({ a: undefined, b: '' })).toBe('')
    expect(toQueryString({ a: 'x y', n: 3, ok: false, skip: undefined })).toBe(
      '?a=x+y&n=3&ok=false',
    )
  })

  it('문자열·숫자·불리언이 아닌 값은 보내지 않는다', () => {
    expect(toQueryString({ a: { nested: 1 }, b: ['x'], c: null })).toBe('')
  })
})

describe('HttpApiClient', () => {
  it('알림 목록은 상태를 쉼표로 이어 보낸다', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse({ alerts: [makeAlert()], nextCursor: null })),
    )
    const result = await createHttpApiClient().alerts.list({
      status: ['OPEN', 'ACKNOWLEDGED'],
      limit: 100,
    })
    expect(result.alerts).toHaveLength(1)
    expect(lastCall(fetchMock).url).toBe('/api/alerts?limit=100&status=OPEN%2CACKNOWLEDGED')
  })

  it('이벤트 목록은 조건을 쿼리로 보낸다', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse({ events: [], nextCursor: null })),
    )
    await createHttpApiClient().events.list({ zone: 'PATH', limit: 20 })
    expect(lastCall(fetchMock).url).toBe('/api/events?zone=PATH&limit=20')
  })

  it('센서 등록은 POST 로 JSON 을 보내고 토큰이 든 응답을 검증한다', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse({ sensor: makeSensor(), deviceToken: 'tsn_example' }, 201)),
    )
    const result = await createHttpApiClient().sensors.create({ name: '복도', zone: 'PATH' })
    expect(result.deviceToken).toBe('tsn_example')
    expect(lastCall(fetchMock)).toMatchObject({
      method: 'POST',
      url: '/api/sensors',
      body: JSON.stringify({ name: '복도', zone: 'PATH' }),
    })
  })

  it('경로에 들어가는 id 는 인코딩한다', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ sensor: makeSensor() })))
    await createHttpApiClient().sensors.get('a/b')
    expect(lastCall(fetchMock).url).toBe('/api/sensors/a%2Fb')
  })

  it('확인·종료·토큰 재발급·삭제는 알맞은 메서드와 경로를 쓴다', async () => {
    const client = createHttpApiClient()
    const alertBody = { alert: makeAlert({ status: 'ACKNOWLEDGED' }) }

    let fetchMock = stubFetch(() => Promise.resolve(jsonResponse(alertBody)))
    await client.alerts.acknowledge('a1')
    expect(lastCall(fetchMock)).toMatchObject({ method: 'POST', url: '/api/alerts/a1/acknowledge' })

    fetchMock = stubFetch(() => Promise.resolve(jsonResponse(alertBody)))
    await client.alerts.resolve('a1', { resolution: 'FALSE_ALARM', note: '확인함' })
    expect(lastCall(fetchMock)).toMatchObject({
      method: 'POST',
      url: '/api/alerts/a1/resolve',
      body: JSON.stringify({ resolution: 'FALSE_ALARM', note: '확인함' }),
    })

    fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse({ sensor: makeSensor(), deviceToken: 'tsn_new' })),
    )
    await client.sensors.rotateToken('s1')
    expect(lastCall(fetchMock)).toMatchObject({
      method: 'POST',
      url: '/api/sensors/s1/rotate-token',
    })

    fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true, deletedEvents: 2 })))
    await client.sensors.remove('s1')
    expect(lastCall(fetchMock)).toMatchObject({ method: 'DELETE', url: '/api/sensors/s1' })
  })

  it('서버가 보낸 오류(409 등)는 성공처럼 다루지 않고 메시지를 보존한다', async () => {
    stubFetch(() => Promise.resolve(errorResponse(409, 'CONFLICT', '이미 종료된 알림입니다.')))
    await expect(createHttpApiClient().alerts.acknowledge('a1')).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      message: '이미 종료된 알림입니다.',
    })
  })

  it('약속된 형식과 다른 성공 응답은 invalid-response 오류가 된다', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ sensors: [{ id: 1 }] })))
    await expect(createHttpApiClient().sensors.list()).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it('연동 현황·테스트 발송·푸시 등록은 알맞은 경로와 메서드를 쓴다', async () => {
    const client = createHttpApiClient()
    let fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse({ integrations: [{ key: 'IN_APP', mode: 'REAL', lastSuccessAt: null }] }),
      ),
    )
    await client.integrations.list()
    expect(lastCall(fetchMock)).toMatchObject({ method: 'GET', url: '/api/system/integrations' })

    fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse({
          channel: 'SMS',
          status: 'NOT_CONFIGURED',
          mode: null,
          error: null,
          testedAt: '2026-11-15T00:00:00.000Z',
        }),
      ),
    )
    await client.notifications.test('SMS')
    expect(lastCall(fetchMock)).toMatchObject({
      method: 'POST',
      url: '/api/notifications/test',
      body: JSON.stringify({ channel: 'SMS' }),
    })

    fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          {
            subscription: {
              id: 'p1',
              host: 'push.example.com',
              createdAt: '2026-11-15T00:00:00.000Z',
            },
          },
          201,
        ),
      ),
    )
    const input = { endpoint: 'https://push.example.com/x', keys: { p256dh: 'k', auth: 'a' } }
    await client.push.subscribe(input)
    expect(lastCall(fetchMock)).toMatchObject({
      method: 'POST',
      url: '/api/push/subscribe',
      body: JSON.stringify(input),
    })

    fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })))
    await client.push.remove('a/b')
    expect(lastCall(fetchMock)).toMatchObject({
      method: 'DELETE',
      url: '/api/push/subscriptions/a%2Fb',
    })
  })

  describe('대시보드 요약', () => {
    const summary = () =>
      buildDashboardSummary({
        now: new Date('2026-11-18T03:00:00.000Z'),
        sensors: [makeSensor()],
        recentEvents: [],
        activeAlerts: [],
        settings: DETECTION_SETTINGS,
        weekly: [],
      })

    it('한 번의 요청(GET /api/v1/dashboard/summary)으로 받고 data 를 벗겨 돌려준다', async () => {
      const body = summary()
      const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ data: body, meta: {} })))
      const result = await createHttpApiClient().dashboard.summary()
      expect(result).toEqual(body)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(lastCall(fetchMock)).toMatchObject({ method: 'GET', url: '/api/v1/dashboard/summary' })
    })

    it('서버가 오류를 주면 그대로 오류로 알린다 (일부만 채운 화면을 만들지 않는다)', async () => {
      stubFetch(() =>
        Promise.resolve(errorResponse(503, 'SERVICE_UNAVAILABLE', '서버에 연결할 수 없습니다.')),
      )
      await expect(createHttpApiClient().dashboard.summary()).rejects.toMatchObject({
        kind: 'http',
        status: 503,
      })
    })

    it('약속과 다른 응답(data 없음·필수 항목 누락)은 성공으로 보지 않는다', async () => {
      stubFetch(() => Promise.resolve(jsonResponse({ sensors: [] })))
      const failure = await createHttpApiClient()
        .dashboard.summary()
        .catch((cause: unknown) => cause)
      expect(failure).toBeInstanceOf(ApiError)
      expect(failure).toMatchObject({ kind: 'invalid-response' })

      stubFetch(() => Promise.resolve(jsonResponse({ data: { ...summary(), weekly: undefined } })))
      await expect(createHttpApiClient().dashboard.summary()).rejects.toMatchObject({
        kind: 'invalid-response',
      })
    })
  })
})
