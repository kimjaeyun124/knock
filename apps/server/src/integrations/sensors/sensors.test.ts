import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import { SensorAdaptersResponseSchema, type StandardSensorEvent } from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { MINUTE, NIGHT } from '@/test-utils/scenario'
import {
  BaseSensorAdapter,
  EventDeduper,
  SimulatorSensorAdapter,
  UnconfiguredHardwareAdapter,
  normalizeCandidate,
  SensorEventGateway,
  reconnectDelayMs,
  DEFAULT_RECONNECT_POLICY,
} from './index'

const logger = pino({ level: 'silent' })
const fixedNow = () => new Date('2026-11-14T17:00:00Z')
const baseOptions = { now: fixedNow, logger, sleep: () => Promise.resolve() }

const valid = {
  eventId: 'evt-00000001',
  deviceId: 'dev-entrance-01',
  eventType: 'MOTION',
  occurredAt: '2026-11-14T16:59:30Z',
}

describe('normalizeCandidate — 표준 이벤트로 정규화', () => {
  const at = new Date('2026-11-14T17:00:00Z')

  it('올바른 신호는 표준 이벤트(eventId·deviceId·eventType·occurredAt·receivedAt·payload)가 된다', () => {
    const result = normalizeCandidate(valid, at)
    expect(result).toEqual({
      ok: true,
      event: {
        eventId: 'evt-00000001',
        deviceId: 'dev-entrance-01',
        eventType: 'MOTION',
        occurredAt: '2026-11-14T16:59:30.000Z',
        receivedAt: '2026-11-14T17:00:00.000Z',
        payload: {},
      },
    })
  })

  it('발생 시각이 없으면(시계 없는 장치) 받은 시각을 쓰고, 밀리초 숫자도 받는다', () => {
    const { occurredAt: _omit, ...withoutTime } = valid
    const a = normalizeCandidate(withoutTime, at)
    expect(a.ok && a.event.occurredAt).toBe(at.toISOString())
    const b = normalizeCandidate({ ...valid, occurredAt: at.getTime() - 5_000 }, at)
    expect(b.ok && b.event.occurredAt).toBe('2026-11-14T16:59:55.000Z')
  })

  it('상태 신호의 배터리·펌웨어를 받고, 배터리가 없으면 만들어 넣지 않는다', () => {
    const withBattery = normalizeCandidate(
      { ...valid, eventType: 'STATUS', payload: { batteryPercent: 55, firmware: '1.2.0' } },
      at,
    )
    expect(withBattery.ok && withBattery.event.payload).toEqual({
      batteryPercent: 55,
      firmware: '1.2.0',
    })
    const without = normalizeCandidate({ ...valid, eventType: 'STATUS' }, at)
    expect(without.ok && without.event.payload).toEqual({})
  })

  it.each([
    ['null', null, 'NOT_AN_OBJECT'],
    ['배열', [valid], 'NOT_AN_OBJECT'],
    ['문자열', 'MOTION', 'NOT_AN_OBJECT'],
    ['이벤트 ID 없음', { ...valid, eventId: undefined }, 'MISSING_EVENT_ID'],
    ['짧은 이벤트 ID', { ...valid, eventId: 'abc' }, 'INVALID_EVENT_ID'],
    ['장치 번호 없음', { ...valid, deviceId: '' }, 'MISSING_DEVICE_ID'],
    ['장치 번호에 공백', { ...valid, deviceId: 'dev 01' }, 'INVALID_DEVICE_ID'],
    ['알 수 없는 종류', { ...valid, eventType: 'FALL' }, 'UNKNOWN_EVENT_TYPE'],
    ['읽을 수 없는 시각', { ...valid, occurredAt: 'yesterday' }, 'INVALID_TIMESTAMP'],
    [
      '범위 밖 배터리',
      { ...valid, eventType: 'STATUS', payload: { batteryPercent: 150 } },
      'INVALID_PAYLOAD',
    ],
    ['움직임에 낙상 정보를 끼워 넣음', { ...valid, payload: { fall: true } }, 'INVALID_PAYLOAD'],
  ])('형식이 틀리면 던지지 않고 이유를 돌려준다: %s', (_name, raw, reason) => {
    const result = normalizeCandidate(raw, at)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })
})

describe('EventDeduper', () => {
  it('같은 키는 기억하는 동안 한 번만 통과하고, 만료되면 다시 통과한다', () => {
    let nowMs = 0
    const deduper = new EventDeduper(() => new Date(nowMs), 1_000, 10)
    expect(deduper.firstSeen('a')).toBe(true)
    expect(deduper.firstSeen('a')).toBe(false)
    nowMs = 1_500
    expect(deduper.firstSeen('a')).toBe(true)
  })

  it('잊게 하면(forget) 다시 받을 수 있고, 가득 차면 오래된 것부터 지운다', () => {
    const deduper = new EventDeduper(() => new Date(0), 60_000, 2)
    deduper.firstSeen('a')
    deduper.firstSeen('b')
    deduper.firstSeen('c') // a 가 밀려남
    expect(deduper.firstSeen('a')).toBe(true)
    deduper.forget('c')
    expect(deduper.firstSeen('c')).toBe(true)
  })
})

describe('어댑터 — 상태·구독·재연결', () => {
  class FlakyAdapter extends BaseSensorAdapter {
    readonly id = 'flaky'
    readonly label = '시험용'
    readonly origin = 'REAL' as const
    readonly protocol = 'TEST'
    opens = 0
    constructor(private readonly failFirst: number) {
      super(baseOptions)
    }
    protected openConnection(): Promise<void> {
      this.opens += 1
      return this.opens <= this.failFirst
        ? Promise.reject(new Error('연결 실패'))
        : Promise.resolve()
    }
    protected closeConnection(): Promise<void> {
      return Promise.resolve()
    }
    protected override get realHardwareConnected(): boolean {
      return true
    }
    push(raw: unknown) {
      return this.receive(raw)
    }
  }

  it('연결에 실패하면 FAILED 로 알리고, 재연결이 성공하면 CONNECTED 가 된다', async () => {
    const adapter = new FlakyAdapter(2)
    await expect(adapter.connect()).rejects.toThrow('연결 실패')
    expect(adapter.getStatus().state).toBe('FAILED')
    expect(adapter.getStatus().realHardwareConnected).toBe(false)

    await adapter.reconnect() // 두 번째 시도는 실패, 세 번째에 성공
    const status = adapter.getStatus()
    expect(status.state).toBe('CONNECTED')
    expect(status.realHardwareConnected).toBe(true)
    expect(status.reconnectAttempts).toBe(0)
    expect(status.errorCount).toBeGreaterThanOrEqual(2)
  })

  it('정해진 횟수 안에 연결되지 않으면 재연결은 실패로 끝난다 (무한 반복하지 않는다)', async () => {
    const adapter = new FlakyAdapter(99)
    await expect(adapter.reconnect()).rejects.toThrow()
    expect(adapter.opens).toBe(DEFAULT_RECONNECT_POLICY.maxAttempts)
    expect(adapter.getStatus().state).toBe('FAILED')
  })

  it('재연결 간격은 지수적으로 늘고 상한을 넘지 않는다', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7].map((n) => reconnectDelayMs(DEFAULT_RECONNECT_POLICY, n))
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000])
  })

  it('정규화에 실패한 신호는 구독자에게 전달되지 않고 오류로 집계되며, 구독자가 던져도 어댑터는 계속 동작한다', async () => {
    const adapter = new FlakyAdapter(0)
    await adapter.connect()
    const received: StandardSensorEvent[] = []
    adapter.subscribeEvents((event) => {
      received.push(event)
    })
    adapter.subscribeEvents(() => {
      throw new Error('구독자 오류')
    })

    await adapter.push({ nonsense: true })
    expect(received).toHaveLength(0)
    await adapter.push(valid)
    expect(received).toHaveLength(1)
    const status = adapter.getStatus()
    expect(status.errorCount).toBe(2) // 형식 오류 1 + 구독자 오류 1
    expect(status.lastEventAt).toBe('2026-11-14T17:00:00.000Z')
  })

  it('구독을 해제하면 더는 받지 않는다', async () => {
    const adapter = new FlakyAdapter(0)
    await adapter.connect()
    const received: StandardSensorEvent[] = []
    const off = adapter.subscribeEvents((event) => {
      received.push(event)
    })
    off()
    await adapter.push(valid)
    expect(received).toHaveLength(0)
  })

  it('실제 하드웨어 자리는 항상 "연결된 장치 없음"이며 연결을 시도하면 실패를 알린다 (연결된 척하지 않는다)', async () => {
    const adapter = new UnconfiguredHardwareAdapter(baseOptions)
    expect(adapter.getStatus()).toMatchObject({
      origin: 'REAL',
      protocol: null,
      state: 'NOT_CONFIGURED',
      realHardwareConnected: false,
      lastEventAt: null,
    })
    await expect(adapter.connect()).rejects.toThrow('설정되어 있지 않습니다')
    await expect(adapter.reconnect()).rejects.toThrow()
    expect(adapter.getStatus().state).toBe('NOT_CONFIGURED')
    expect(adapter.getStatus().realHardwareConnected).toBe(false)
  })

  it('시뮬레이터 어댑터는 연결되어도 실제 하드웨어 연결로 보고하지 않고, 끊겨 있으면 신호를 받지 않는다', async () => {
    const adapter = new SimulatorSensorAdapter(baseOptions)
    const received: StandardSensorEvent[] = []
    adapter.subscribeEvents((event) => {
      received.push(event)
    })
    expect((await adapter.inject(valid)).ok).toBe(false)
    expect(received).toHaveLength(0)

    await adapter.connect()
    expect((await adapter.inject(valid)).ok).toBe(true)
    expect(received).toHaveLength(1)
    expect(adapter.getStatus()).toMatchObject({
      origin: 'SIMULATED',
      state: 'CONNECTED',
      realHardwareConnected: false,
    })
  })
})

describe('SensorEventGateway — 같은 처리 경로', () => {
  const contexts: TestContext[] = []
  afterEach(async () => {
    for (const ctx of contexts.splice(0)) await ctx.close()
  })

  async function fixture() {
    const ctx = await createTestContext({ simulator: true })
    contexts.push(ctx)
    ctx.clock.set(NIGHT)
    const user = await ctx.createHousehold()
    const client = await ctx.loginAs(user)
    const register = async (
      deviceId: string,
      options: {
        origin?: 'REAL' | 'SIMULATED'
        zone?: 'BED_SIDE' | 'PATH' | 'ENTRANCE'
        isActive?: boolean
      } = {},
    ) => {
      const sensor = await ctx.createSensor(user.householdId, {
        name: deviceId,
        zone: options.zone ?? 'ENTRANCE',
        origin: options.origin ?? 'SIMULATED',
        isActive: options.isActive ?? true,
      })
      await ctx.prisma.sensor.update({ where: { id: sensor.id }, data: { deviceId } })
      return sensor
    }
    const adapter = new SimulatorSensorAdapter({
      now: ctx.clock.now,
      logger,
      sleep: () => Promise.resolve(),
    })
    await adapter.connect()
    ctx.services.sensorGateway.attach(adapter, user.householdId)
    const events = (sensorId: string) =>
      ctx.prisma.movementEvent.findMany({ where: { sensorId }, orderBy: { occurredAt: 'asc' } })
    return { ctx, user, client, register, adapter, events }
  }

  const motion = (eventId: string, deviceId: string, occurredAt?: string) => ({
    eventId,
    deviceId,
    eventType: 'MOTION',
    ...(occurredAt ? { occurredAt } : {}),
  })

  it('어댑터로 들어온 움직임이 저장·분류되고 알림이 생긴다 (HTTP 수집과 같은 결과)', async () => {
    const { ctx, register, adapter, events } = await fixture()
    const viaAdapter = await register('dev-adapter-01')
    const viaHttp = await ctx.createSensor(
      (await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: viaAdapter.id } })).householdId,
      { name: 'http', zone: 'ENTRANCE', origin: 'SIMULATED' },
    )

    await adapter.inject(motion('evt-adapter-001', 'dev-adapter-01'))
    const http = await fetch(`${ctx.baseUrl}/api/ingest/v1/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viaHttp.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ eventId: 'evt-http-0001', type: 'MOTION' }] }),
    })
    expect(http.status).toBe(200)

    const [a] = await events(viaAdapter.id)
    const [h] = await events(viaHttp.id)
    expect(a).toBeDefined()
    expect(a?.origin).toBe('SIMULATED')
    expect(a?.eventClass).toBe(h?.eventClass) // 같은 판단 엔진
    expect(a?.eventClass).toBe('ENTRANCE_ACTIVITY')

    const alerts = await ctx.prisma.alert.findMany({ where: { sensorId: viaAdapter.id } })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('ENTRANCE_APPROACH')
  })

  it('같은 이벤트 ID 는 한 번만 처리된다 (어댑터 단계 중복 제거 + DB)', async () => {
    const { ctx, user, register, adapter, events } = await fixture()
    const sensor = await register('dev-dup-01')
    await adapter.inject(motion('evt-dup-00001', 'dev-dup-01'))
    await adapter.inject(motion('evt-dup-00001', 'dev-dup-01'))
    expect(await events(sensor.id)).toHaveLength(1)

    // 서버가 다시 시작되어 게이트웨이 기억이 사라져도 DB 의 유일 제약이 중복을 막는다.
    const fresh = createFreshGateway(ctx)
    const result = await fresh.handle(
      user.householdId,
      'SIMULATED',
      expectOk(normalizeCandidate(motion('evt-dup-00001', 'dev-dup-01'), ctx.clock.now())),
    )
    expect(result.status).toBe('DUPLICATE')
    expect(await events(sensor.id)).toHaveLength(1)
  })

  it('등록되지 않은 장치 번호는 센서를 만들지 않고 거부한다', async () => {
    const { ctx, user, adapter } = await fixture()
    const before = await ctx.prisma.sensor.count()
    const result = await ctx.services.sensorGateway.handle(
      user.householdId,
      'SIMULATED',
      expectOk(adapter.normalizeEvent(motion('evt-unknown-1', 'dev-nobody'), ctx.clock.now())),
    )
    expect(result).toEqual({
      eventId: 'evt-unknown-1',
      status: 'REJECTED',
      reason: 'UNKNOWN_DEVICE',
    })
    expect(await ctx.prisma.sensor.count()).toBe(before)
  })

  it('다른 가구의 같은 장치 번호는 섞이지 않는다', async () => {
    const { ctx, register, adapter } = await fixture()
    const mine = await register('dev-shared-01')
    const other = await ctx.createHousehold({ email: 'other@example.com' })
    const theirs = await ctx.createSensor(other.householdId, {
      name: '다른 가구',
      origin: 'SIMULATED',
    })
    await ctx.prisma.sensor.update({
      where: { id: theirs.id },
      data: { deviceId: 'dev-shared-01' },
    })

    await adapter.inject(motion('evt-tenant-01', 'dev-shared-01'))
    expect(await ctx.prisma.movementEvent.count({ where: { sensorId: mine.id } })).toBe(1)
    expect(await ctx.prisma.movementEvent.count({ where: { sensorId: theirs.id } })).toBe(0)
  })

  it('출처가 다르면 거부한다: 시뮬레이터 어댑터가 실제 센서의 기록을 만들 수 없다', async () => {
    const { ctx, register, adapter } = await fixture()
    const real = await register('dev-real-01', { origin: 'REAL' })
    await adapter.inject(motion('evt-origin-01', 'dev-real-01'))
    expect(await ctx.prisma.movementEvent.count({ where: { sensorId: real.id } })).toBe(0)
    const result = await ctx.services.sensorGateway.handle(
      (await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: real.id } })).householdId,
      'SIMULATED',
      expectOk(adapter.normalizeEvent(motion('evt-origin-02', 'dev-real-01'), ctx.clock.now())),
    )
    expect(result.reason).toBe('ORIGIN_MISMATCH')
  })

  it('사용 안 함 센서의 신호는 받지 않는다', async () => {
    const { ctx, user, register, adapter } = await fixture()
    const off = await register('dev-off-01', { isActive: false })
    const result = await ctx.services.sensorGateway.handle(
      user.householdId,
      'SIMULATED',
      expectOk(adapter.normalizeEvent(motion('evt-off-0001', 'dev-off-01'), ctx.clock.now())),
    )
    expect(result.reason).toBe('SENSOR_DISABLED')
    expect(await ctx.prisma.movementEvent.count({ where: { sensorId: off.id } })).toBe(0)
  })

  it('수집 서비스의 시간 규칙이 그대로 적용된다 (너무 오래됨·미래)', async () => {
    const { ctx, user, register, adapter } = await fixture()
    await register('dev-time-01')
    const old = new Date(ctx.clock.now().getTime() - 25 * 60 * MINUTE).toISOString()
    const future = new Date(ctx.clock.now().getTime() + 5 * MINUTE).toISOString()
    const handle = (id: string, at: string) =>
      ctx.services.sensorGateway.handle(
        user.householdId,
        'SIMULATED',
        expectOk(adapter.normalizeEvent(motion(id, 'dev-time-01', at), ctx.clock.now())),
      )
    expect((await handle('evt-old-00001', old)).reason).toBe('TOO_OLD')
    expect((await handle('evt-future-01', future)).reason).toBe('FUTURE_TIMESTAMP')
  })

  it('상태 신호는 heartbeat 로 저장되고, 배터리 정보가 없으면 값을 만들지 않는다', async () => {
    const { ctx, register, adapter } = await fixture()
    const sensor = await register('dev-status-01')
    await adapter.inject({
      eventId: 'evt-status-01',
      deviceId: 'dev-status-01',
      eventType: 'STATUS',
      payload: {},
    })
    let row = await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: sensor.id } })
    expect(row.lastHeartbeatAt).not.toBeNull()
    expect(row.batteryPercent).toBeNull()

    ctx.clock.advance(MINUTE)
    await adapter.inject({
      eventId: 'evt-status-02',
      deviceId: 'dev-status-01',
      eventType: 'STATUS',
      payload: { batteryPercent: 12 },
    })
    row = await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: sensor.id } })
    expect(row.batteryPercent).toBe(12)
  })

  it('처리 중 DB 오류가 나도 던지지 않고 ERROR 로 알리며, 같은 신호를 다시 받을 수 있다', async () => {
    const { ctx, user, register, adapter } = await fixture()
    const sensor = await register('dev-err-01')
    const original = ctx.services.ingest.ingestEvents.bind(ctx.services.ingest)
    let failing = true
    ctx.services.ingest.ingestEvents = async (...args) => {
      if (failing) throw new Error('DB 접근 실패')
      return original(...args)
    }
    const event = expectOk(
      adapter.normalizeEvent(motion('evt-retry-001', 'dev-err-01'), ctx.clock.now()),
    )
    expect(
      (await ctx.services.sensorGateway.handle(user.householdId, 'SIMULATED', event)).status,
    ).toBe('ERROR')
    failing = false
    expect(
      (await ctx.services.sensorGateway.handle(user.householdId, 'SIMULATED', event)).status,
    ).toBe('ACCEPTED')
    expect(await ctx.prisma.movementEvent.count({ where: { sensorId: sensor.id } })).toBe(1)
  })

  it('GET /api/system/sensor-adapters: 실제 하드웨어는 연결된 장치 없음으로 보고된다', async () => {
    const { client } = await fixture()
    const res = await client.get('/api/system/sensor-adapters')
    expect(res.status).toBe(200)
    const body = SensorAdaptersResponseSchema.parse(await res.json())
    const hardware = body.adapters.find((a) => a.id === 'hardware')
    expect(hardware).toMatchObject({
      origin: 'REAL',
      state: 'NOT_CONFIGURED',
      realHardwareConnected: false,
    })
    expect(body.adapters.some((a) => a.realHardwareConnected)).toBe(false)
  })

  it('로그인하지 않으면 어댑터 상태를 볼 수 없다', async () => {
    const { ctx } = await fixture()
    const res = await fetch(`${ctx.baseUrl}/api/system/sensor-adapters`)
    expect(res.status).toBe(401)
  })
})

function expectOk(result: ReturnType<typeof normalizeCandidate>): StandardSensorEvent {
  if (!result.ok) throw new Error(`정규화 실패: ${result.reason}`)
  return result.event
}

function createFreshGateway(ctx: TestContext) {
  // 서버를 다시 시작한 것처럼 기억이 비어 있는 새 게이트웨이를 같은 DB 위에 만든다.
  return new SensorEventGateway(ctx.prisma, ctx.services.ingest, ctx.clock.now, logger)
}
