import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  EventsResponseSchema,
  HeartbeatResponseSchema,
  IngestEventsResponseSchema,
  SensorResponseSchema,
  type IngestEventsResponse,
} from '@tetris/shared'
import { IngestClient, IngestError } from '@tetris/simulator'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import type { TestClient } from '@/test-utils/http'

const MINUTE = 60_000

describe('수집 API (장치용)', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold
  let clientA: TestClient

  beforeAll(async () => {
    ctx = await createTestContext()
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
    clientA = await ctx.loginAs(a)
  })
  afterAll(async () => {
    await ctx.close()
  })

  let counter = 0
  const eventId = () => `evt-${String(++counter).padStart(10, '0')}`
  const iso = (offsetMs: number) => new Date(ctx.clock.now().getTime() + offsetMs).toISOString()

  function post(
    path: string,
    token: string | null,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(`${ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  }
  const sendEvents = async (token: string, events: unknown[]): Promise<IngestEventsResponse> => {
    const res = await post('/api/ingest/v1/events', token, { events })
    expect(res.status).toBe(200)
    return IngestEventsResponseSchema.parse(await res.json())
  }
  const motion = (extra: { occurredAt?: string } & Record<string, unknown> = {}) => ({
    eventId: eventId(),
    type: 'MOTION',
    ...extra,
  })
  const storedEvents = (sensorId: string) =>
    ctx.prisma.movementEvent.findMany({ where: { sensorId }, orderBy: { occurredAt: 'asc' } })
  const getSensor = async (id: string) =>
    SensorResponseSchema.parse(await (await clientA.get(`/api/sensors/${id}`)).json()).sensor
  const errorOf = async (res: Response) => ApiErrorBodySchema.parse(await res.json()).error

  describe('인증', () => {
    it('토큰이 없거나 틀리면 401 이고 WWW-Authenticate 를 돌려준다', async () => {
      const { token } = await ctx.createSensor(a.householdId)
      for (const header of [
        undefined,
        'Bearer tsn_wrong',
        'Bearer wrong-without-prefix',
        'Basic abc',
        `Bearer ${token}x`,
      ]) {
        const res = await post(
          '/api/ingest/v1/heartbeat',
          null,
          {},
          header ? { Authorization: header } : {},
        )
        expect(res.status, String(header)).toBe(401)
        expect(res.headers.get('www-authenticate')).toBe('Bearer')
        expect((await errorOf(res)).code).toBe('UNAUTHORIZED')
      }
    })

    it('보호자의 로그인 쿠키로는 수집 API 를 쓸 수 없다', async () => {
      const res = await fetch(`${ctx.baseUrl}/api/ingest/v1/heartbeat`, {
        method: 'POST',
        headers: { Cookie: clientA.cookie ?? '', 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(res.status).toBe(401)
    })

    it('장치 토큰으로는 사용자용 API(센서 목록·기록)를 볼 수 없다', async () => {
      const { token } = await ctx.createSensor(a.householdId)
      for (const path of ['/api/sensors', '/api/events', '/api/settings/detection']) {
        const res = await fetch(`${ctx.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        expect(res.status, path).toBe(401)
      }
    })

    it('"사용 안 함"으로 끈 센서는 403 이고 아무것도 저장하지 않는다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId, { isActive: false })
      const events = await post('/api/ingest/v1/events', token, { events: [motion()] })
      expect(events.status).toBe(403)
      expect((await errorOf(events)).message).toContain('사용 안 함')
      expect((await post('/api/ingest/v1/heartbeat', token, {})).status).toBe(403)

      expect(await storedEvents(id)).toHaveLength(0)
      expect((await ctx.prisma.sensor.findUniqueOrThrow({ where: { id } })).lastSeenAt).toBeNull()
    })
  })

  describe('이벤트 저장', () => {
    it('구역과 출처는 장치가 아니라 등록된 센서 정보에서 가져온다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId, { zone: 'ENTRANCE' })
      const e = motion({ occurredAt: iso(-5_000), zone: 'BED_SIDE', origin: 'SIMULATED' })
      const res = await sendEvents(token, [e])
      expect(res.results).toEqual([{ eventId: e.eventId, status: 'ACCEPTED' }])

      const [row] = await storedEvents(id)
      expect(row).toMatchObject({
        householdId: a.householdId,
        zone: 'ENTRANCE',
        origin: 'REAL',
        deviceEventId: e.eventId,
        isLate: false,
      })
      expect(row?.occurredAt.toISOString()).toBe(e.occurredAt)
    })

    it('발생 시각을 생략하면 서버가 받은 시각을 쓴다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const res = await sendEvents(token, [motion()])
      const [row] = await storedEvents(id)
      expect(row?.occurredAt.toISOString()).toBe(res.serverTime)
      expect(row?.receivedAt.toISOString()).toBe(res.serverTime)
    })

    it('시간대 오프셋이 붙은 발생 시각도 같은 순간으로 저장한다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const instant = new Date(ctx.clock.now().getTime() - 5_000)
      const withOffset = new Date(instant.getTime() + 9 * 3_600_000)
        .toISOString()
        .replace('Z', '+09:00')
      await sendEvents(token, [motion({ occurredAt: withOffset })])
      const [row] = await storedEvents(id)
      expect(row?.occurredAt.toISOString()).toBe(instant.toISOString())
    })

    it('여러 건은 요청 순서대로 결과를 돌려주고, 거부된 것은 저장하지 않는다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const ok1 = motion({ occurredAt: iso(-1000) })
      const future = motion({ occurredAt: iso(10 * MINUTE) })
      const ok2 = motion({ occurredAt: iso(-2000) })
      const res = await sendEvents(token, [ok1, future, ok2])
      expect(res.results.map((r) => [r.eventId, r.status, r.reason])).toEqual([
        [ok1.eventId, 'ACCEPTED', undefined],
        [future.eventId, 'REJECTED', 'FUTURE_TIMESTAMP'],
        [ok2.eventId, 'ACCEPTED', undefined],
      ])
      expect((await storedEvents(id)).map((r) => r.deviceEventId).sort()).toEqual(
        [ok1.eventId, ok2.eventId].sort(),
      )
    })
  })

  describe('중복 전송 (멱등)', () => {
    it('같은 이벤트를 다시 보내면 DUPLICATE 이고 한 번만 저장된다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const e = motion()
      expect((await sendEvents(token, [e])).results[0]?.status).toBe('ACCEPTED')
      expect((await sendEvents(token, [e])).results[0]?.status).toBe('DUPLICATE')
      expect(await storedEvents(id)).toHaveLength(1)
    })

    it('한 요청 안에 같은 ID 가 두 번 있어도 한 번만 저장된다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const e = motion()
      const res = await sendEvents(token, [e, e])
      expect(res.results.map((r) => r.status)).toEqual(['ACCEPTED', 'DUPLICATE'])
      expect(await storedEvents(id)).toHaveLength(1)
    })

    it('같은 요청이 동시에 여러 번 도착해도 정확히 한 번만 저장되고 오류가 나지 않는다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const e = motion()
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => post('/api/ingest/v1/events', token, { events: [e] })),
      )
      expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200))
      const statuses = (
        await Promise.all(
          responses.map(async (r) => IngestEventsResponseSchema.parse(await r.json())),
        )
      ).map((r) => r.results[0]?.status)
      expect(statuses.filter((s) => s === 'ACCEPTED')).toHaveLength(1)
      expect(statuses.filter((s) => s === 'DUPLICATE')).toHaveLength(5)
      expect(await storedEvents(id)).toHaveLength(1)
    })

    it('이벤트 ID 는 센서마다 따로 관리된다 (다른 센서의 같은 ID 는 별개)', async () => {
      const s1 = await ctx.createSensor(a.householdId)
      const s2 = await ctx.createSensor(a.householdId)
      const e = motion()
      expect((await sendEvents(s1.token, [e])).results[0]?.status).toBe('ACCEPTED')
      expect((await sendEvents(s2.token, [e])).results[0]?.status).toBe('ACCEPTED')
    })
  })

  describe('시각 검사', () => {
    it('발생 후 2분 이상 늦게 도착한 이벤트는 버리지 않고 isLate 로 표시한다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const fresh = motion({ occurredAt: iso(-119_000) })
      const late = motion({ occurredAt: iso(-120_000) })
      const veryLate = motion({ occurredAt: iso(-3 * 60 * MINUTE) })
      await sendEvents(token, [fresh, late, veryLate])
      const rows = new Map((await storedEvents(id)).map((r) => [r.deviceEventId, r.isLate]))
      expect(rows.get(fresh.eventId)).toBe(false)
      expect(rows.get(late.eventId)).toBe(true)
      expect(rows.get(veryLate.eventId)).toBe(true)
    })

    it('미래 시각은 1분까지만 허용하고 그보다 크면 FUTURE_TIMESTAMP 로 거부한다', async () => {
      const { token } = await ctx.createSensor(a.householdId)
      const okFuture = motion({ occurredAt: iso(59_000) })
      const badFuture = motion({ occurredAt: iso(61_000) })
      const res = await sendEvents(token, [okFuture, badFuture])
      expect(res.results.map((r) => [r.status, r.reason])).toEqual([
        ['ACCEPTED', undefined],
        ['REJECTED', 'FUTURE_TIMESTAMP'],
      ])
    })

    it('24시간보다 오래된 이벤트는 TOO_OLD 로 거부한다', async () => {
      const { token } = await ctx.createSensor(a.householdId)
      const day = 24 * 60 * MINUTE
      const okOld = motion({ occurredAt: iso(-day + MINUTE) })
      const tooOld = motion({ occurredAt: iso(-day - MINUTE) })
      const res = await sendEvents(token, [okOld, tooOld])
      expect(res.results.map((r) => [r.status, r.reason])).toEqual([
        ['ACCEPTED', undefined],
        ['REJECTED', 'TOO_OLD'],
      ])
    })

    it('지원하지 않는 이벤트 종류는 400 이다', async () => {
      // 센서 종류가 늘어나면 TYPE_MISMATCH(센서가 지원하지 않는 종류) 검사가 의미를 가진다. 지금은 스키마가 막는다.
      const { token } = await ctx.createSensor(a.householdId)
      const res = await post('/api/ingest/v1/events', token, {
        events: [{ eventId: eventId(), type: 'DOOR' }],
      })
      expect(res.status).toBe(400)
    })
  })

  describe('요청 형식', () => {
    it.each([
      ['이벤트가 하나도 없음', { events: [] }],
      [
        '이벤트가 101건',
        {
          events: Array.from({ length: 101 }, (_, i) => ({
            eventId: `bulk-evt-${i + 1000}`,
            type: 'MOTION',
          })),
        },
      ],
      ['이벤트 ID 가 너무 짧음', { events: [{ eventId: 'short', type: 'MOTION' }] }],
      [
        '이벤트 ID 에 허용되지 않는 문자',
        { events: [{ eventId: 'bad id with spaces', type: 'MOTION' }] },
      ],
      [
        '발생 시각 형식이 틀림',
        { events: [{ eventId: 'evt-valid-001', type: 'MOTION', occurredAt: 'yesterday' }] },
      ],
      ['events 가 배열이 아님', { events: 'x' }],
      ['본문이 비어 있음', undefined],
    ])('잘못된 요청은 400 이고 아무것도 저장하지 않는다: %s', async (_name, body) => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const res = await post('/api/ingest/v1/events', token, body)
      expect(res.status).toBe(400)
      expect((await errorOf(res)).code).toBe('VALIDATION_ERROR')
      expect(await storedEvents(id)).toHaveLength(0)
    })

    it('정확히 100건은 받아 준다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const events = Array.from({ length: 100 }, () => motion())
      const res = await sendEvents(token, events)
      expect(res.results.every((r) => r.status === 'ACCEPTED')).toBe(true)
      expect(await storedEvents(id)).toHaveLength(100)
    })
  })

  describe('상태 신호(heartbeat)', () => {
    it('첫 신호를 받으면 PENDING 에서 ONLINE 이 되고 배터리·펌웨어·이력이 남는다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      expect((await getSensor(id)).state).toBe('PENDING')

      const res = await post('/api/ingest/v1/heartbeat', token, {
        batteryPercent: 80,
        firmware: '0.1.0',
      })
      expect(res.status).toBe(200)
      const { serverTime } = HeartbeatResponseSchema.parse(await res.json())

      const sensor = await getSensor(id)
      expect(sensor).toMatchObject({
        state: 'ONLINE',
        batteryPercent: 80,
        batteryLevel: 'OK',
        firmwareVersion: '0.1.0',
        lastSeenAt: serverTime,
      })
      const logs = await ctx.prisma.sensorStatusLog.findMany({ where: { sensorId: id } })
      expect(logs.map((l) => l.kind)).toEqual(['CONNECTED'])
    })

    it('본문 없이 보내도 신호로 인정된다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      expect((await post('/api/ingest/v1/heartbeat', token)).status).toBe(200)
      expect((await getSensor(id)).state).toBe('ONLINE')
    })

    it('움직임 이벤트를 보내는 것도 "살아 있다"는 신호다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      await sendEvents(token, [motion()])
      expect((await getSensor(id)).state).toBe('ONLINE')
    })

    it('중복이거나 거부된 이벤트만 보내도 센서가 살아 있다고 기록한다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      await sendEvents(token, [motion({ occurredAt: iso(10 * MINUTE) })]) // 전부 거부
      expect((await getSensor(id)).state).toBe('ONLINE')
    })

    it('배터리 수준이 바뀔 때만 이력을 남긴다 (정상 → 부족 → 위급 → 정상)', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      for (const battery of [80, 75, 20, 18, 10, 9, 60, 55]) {
        await post('/api/ingest/v1/heartbeat', token, { batteryPercent: battery })
      }
      const logs = await ctx.prisma.sensorStatusLog.findMany({
        where: { sensorId: id },
        orderBy: { at: 'asc' },
      })
      expect(logs.map((l) => l.kind)).toEqual([
        'CONNECTED',
        'BATTERY_LOW',
        'BATTERY_CRITICAL',
        'BATTERY_OK',
      ])
      expect((await getSensor(id)).batteryLevel).toBe('OK')
    })

    it('처음 받은 배터리 값이 이미 부족하면 바로 이력을 남긴다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      await post('/api/ingest/v1/heartbeat', token, { batteryPercent: 8 })
      const kinds = (await ctx.prisma.sensorStatusLog.findMany({ where: { sensorId: id } })).map(
        (l) => l.kind,
      )
      expect(kinds).toContain('BATTERY_CRITICAL')
      expect((await getSensor(id)).batteryLevel).toBe('CRITICAL')
    })

    it('신호가 끊기면 OFFLINE 으로 계산되고, 다시 신호가 오면 복구 이력이 남는다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      await post('/api/ingest/v1/heartbeat', token, {})
      ctx.clock.advance(300_000)
      expect((await getSensor(id)).state).toBe('ONLINE')
      ctx.clock.advance(1_000)
      expect((await getSensor(id)).state).toBe('OFFLINE')

      await post('/api/ingest/v1/heartbeat', token, {})
      expect((await getSensor(id)).state).toBe('ONLINE')
      const logs = await ctx.prisma.sensorStatusLog.findMany({
        where: { sensorId: id },
        orderBy: { at: 'asc' },
      })
      expect(logs.map((l) => [l.kind, l.detail])).toEqual([
        ['CONNECTED', '첫 신호를 받았습니다.'],
        ['CONNECTED', '연결이 복구되었습니다.'],
      ])
    })

    it('연결 끊김·배터리 기준은 보호자가 바꾼 설정을 따른다', async () => {
      const user = await ctx.createHousehold()
      const client = await ctx.loginAs(user)
      const { id, token } = await ctx.createSensor(user.householdId)
      const current = await (await client.get('/api/settings/detection')).json()
      const { updatedAt: _ignored, ...settings } = current as Record<string, unknown>
      await client.put('/api/settings/detection', {
        ...settings,
        offlineAfterSeconds: 60,
        lowBatteryPercent: 40,
        criticalBatteryPercent: 30,
      })

      await post('/api/ingest/v1/heartbeat', token, { batteryPercent: 35 })
      const sensor = SensorResponseSchema.parse(
        await (await client.get(`/api/sensors/${id}`)).json(),
      ).sensor
      expect(sensor.batteryLevel).toBe('LOW')

      ctx.clock.advance(61_000)
      const later = SensorResponseSchema.parse(
        await (await client.get(`/api/sensors/${id}`)).json(),
      ).sensor
      expect(later.state).toBe('OFFLINE')
    })

    it('처음 신호가 동시에 여러 번 와도 "연결됨" 이력은 한 번만 남는다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      await Promise.all(
        Array.from({ length: 4 }, () => post('/api/ingest/v1/heartbeat', token, {})),
      )
      const logs = await ctx.prisma.sensorStatusLog.findMany({ where: { sensorId: id } })
      expect(logs.filter((l) => l.kind === 'CONNECTED')).toHaveLength(1)
    })

    it.each([
      [{ batteryPercent: 101 }],
      [{ batteryPercent: -1 }],
      [{ batteryPercent: 55.5 }],
      [{ batteryPercent: '50' }],
      [{ firmware: 'x'.repeat(33) }],
    ])('올바르지 않은 값은 400 이고 상태를 바꾸지 않는다: %j', async (body) => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const res = await post('/api/ingest/v1/heartbeat', token, body)
      expect(res.status).toBe(400)
      expect((await getSensor(id)).state).toBe('PENDING')
    })
  })

  describe('센서 구역 변경과 기록', () => {
    it('센서 구역을 바꿔도 이미 저장된 기록의 구역은 그대로이고, 새 기록부터 새 구역을 쓴다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId, { zone: 'BED_SIDE' })
      const before = motion({ occurredAt: iso(-3000) })
      await sendEvents(token, [before])

      await clientA.request(`/api/sensors/${id}`, { method: 'PATCH', body: { zone: 'ENTRANCE' } })
      const after = motion({ occurredAt: iso(-1000) })
      await sendEvents(token, [after])

      const rows = new Map((await storedEvents(id)).map((r) => [r.deviceEventId, r.zone]))
      expect(rows.get(before.eventId)).toBe('BED_SIDE')
      expect(rows.get(after.eventId)).toBe('ENTRANCE')
    })
  })

  describe('요청 제한', () => {
    it('센서 하나가 1분에 120번을 넘기면 429 와 Retry-After 로 알리고, 시간이 지나면 풀린다', async () => {
      const { token } = await ctx.createSensor(a.householdId)
      for (let i = 0; i < 120; i += 1) {
        const res = await post('/api/ingest/v1/heartbeat', token, {})
        expect(res.status).toBe(200)
      }
      const blocked = await post('/api/ingest/v1/heartbeat', token, {})
      expect(blocked.status).toBe(429)
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
      expect((await errorOf(blocked)).code).toBe('RATE_LIMITED')

      ctx.clock.advance(61_000)
      expect((await post('/api/ingest/v1/heartbeat', token, {})).status).toBe(200)
    })

    it('한 센서의 제한이 다른 센서에는 영향을 주지 않는다', async () => {
      const busy = await ctx.createSensor(a.householdId)
      const calm = await ctx.createSensor(a.householdId)
      for (let i = 0; i < 121; i += 1) await post('/api/ingest/v1/heartbeat', busy.token, {})
      expect((await post('/api/ingest/v1/heartbeat', calm.token, {})).status).toBe(200)
    })

    it('잘못된 토큰을 반복해도 정상 센서의 요청은 막히지 않는다', async () => {
      const { token } = await ctx.createSensor(a.householdId)
      for (let i = 0; i < 40; i += 1) await post('/api/ingest/v1/heartbeat', 'tsn_wrong', {})
      expect((await post('/api/ingest/v1/heartbeat', token, {})).status).toBe(200)
    })
  })

  describe('수신 후처리 훅 (Phase 3 연결 지점)', () => {
    it('새로 저장된 이벤트만 전달하고, 후처리가 실패해도 장치 요청은 성공한다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const received: string[][] = []
      const off1 = ctx.services.ingest.onEventsAccepted((batch) => {
        received.push(batch.events.map((e) => e.deviceEventId))
      })
      const off2 = ctx.services.ingest.onEventsAccepted(() => {
        throw new Error('후처리 실패')
      })
      try {
        const e1 = motion()
        const e2 = motion()
        await sendEvents(token, [e1])
        await sendEvents(token, [e1, e2]) // e1 은 중복
        await sendEvents(token, [e1]) // 전부 중복 → 훅 호출 없음
        expect(received).toEqual([[e1.eventId], [e2.eventId]])
        expect(await storedEvents(id)).toHaveLength(2)
      } finally {
        off1()
        off2()
      }
    })
  })

  describe('데이터 범위', () => {
    it('센서가 보낸 이벤트는 그 센서의 가구에만 보이고, 다른 가구에는 보이지 않는다', async () => {
      const mine = await ctx.createSensor(a.householdId, { zone: 'BED_SIDE' })
      await sendEvents(mine.token, [motion({ occurredAt: iso(-1000) })])

      const clientB = await ctx.loginAs(b)
      const seenByB = EventsResponseSchema.parse(await (await clientB.get('/api/events')).json())
      expect(seenByB.events.every((e) => e.sensorId !== mine.id)).toBe(true)
      const filtered = EventsResponseSchema.parse(
        await (await clientB.get(`/api/events?sensorId=${mine.id}`)).json(),
      )
      expect(filtered.events).toEqual([])

      const seenByA = EventsResponseSchema.parse(
        await (await clientA.get(`/api/events?sensorId=${mine.id}`)).json(),
      )
      expect(seenByA.events).toHaveLength(1)
      expect(seenByA.events[0]).toMatchObject({ zone: 'BED_SIDE', origin: 'REAL', isLate: false })
    })
  })

  describe('시뮬레이터 클라이언트(@tetris/simulator)로 같은 API 사용', () => {
    it('이벤트·heartbeat 를 보내고, 같은 ID 재전송은 DUPLICATE 로 확인된다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      const client = new IngestClient({ baseUrl: ctx.baseUrl, token })

      const first = await client.sendMotion({ eventId: 'sim-event-0001' })
      expect(first.results[0]?.status).toBe('ACCEPTED')
      const again = await client.sendMotion({ eventId: 'sim-event-0001' })
      expect(again.results[0]?.status).toBe('DUPLICATE')

      await client.sendHeartbeat({ batteryPercent: 64 })
      expect(await getSensor(id)).toMatchObject({ state: 'ONLINE', batteryPercent: 64 })
      expect(await storedEvents(id)).toHaveLength(1)
    })

    it('잘못된 토큰은 IngestError(401) 로 알린다', async () => {
      const client = new IngestClient({ baseUrl: ctx.baseUrl, token: 'tsn_wrong' })
      const error = await client.sendHeartbeat().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(IngestError)
      expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    })
  })
})
