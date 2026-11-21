import { randomUUID } from 'node:crypto'
import pino from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertListResponseSchema,
  LONG_SILENT_SECONDS,
  SensorResponseSchema,
  type Sensor,
} from '@tetris/shared'
import { createServices } from '@/container'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { MINUTE, NIGHT, TestDevice, openSocket } from '@/test-utils/scenario'

/**
 * 센서 상태 모니터링 (docs/SENSOR_HEALTH.md): 연결 상태·마지막 통신·heartbeat·배터리·비활성·수신 오류·장시간 미응답,
 * 상태 변경 기록·알림·복구·서버 재시작 후 복원. 모든 신호는 실제 수집 API 로 보낸다.
 */
const contexts: TestContext[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.close()
})

async function fixture() {
  const ctx = await createTestContext()
  contexts.push(ctx)
  ctx.clock.set(NIGHT)
  const user = await ctx.createHousehold()
  const client = await ctx.loginAs(user)
  const make = async (name: string, zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE' = 'PATH') => {
    const sensor = await ctx.createSensor(user.householdId, { name, zone })
    return { id: sensor.id, token: sensor.token, device: new TestDevice(ctx, sensor.token) }
  }
  const sensor = async (id: string): Promise<Sensor> =>
    SensorResponseSchema.parse(await (await client.get(`/api/sensors/${id}`)).json()).sensor
  const alerts = async () =>
    AlertListResponseSchema.parse(await (await client.get('/api/alerts?limit=100')).json()).alerts
  const post = (token: string, path: string, body: unknown) =>
    fetch(`${ctx.baseUrl}/api/ingest/v1/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const check = () => ctx.services.pipeline.checkSensorConnections()
  const statusLogs = (sensorId: string) =>
    ctx.prisma.sensorStatusLog.findMany({
      where: { sensorId },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    })
  return { ctx, user, client, make, sensor, alerts, post, check, statusLogs }
}

describe('마지막 통신·heartbeat', () => {
  it('heartbeat 를 받으면 마지막 heartbeat 시각을 저장하고, 움직임 신호는 마지막 통신만 갱신한다', async () => {
    const { ctx, make, sensor } = await fixture()
    const s = await make('복도')
    expect((await sensor(s.id)).lastHeartbeatAt).toBeNull()

    await s.device.motion()
    const afterMotion = await sensor(s.id)
    expect(afterMotion.lastSeenAt).not.toBeNull()
    expect(afterMotion.lastHeartbeatAt).toBeNull() // 움직임은 heartbeat 가 아니다

    ctx.clock.advance(3 * MINUTE)
    await s.device.heartbeat({ batteryPercent: 90 })
    const afterBeat = await sensor(s.id)
    expect(afterBeat.lastHeartbeatAt).toBe(ctx.clock.now().toISOString())
    expect(afterBeat.lastSeenAt).toBe(ctx.clock.now().toISOString())
    expect(afterBeat.silentSeconds).toBe(0)
  })

  it('배터리 정보를 보내지 않는 장치도 heartbeat 만으로 연결 상태가 유지된다 (본문 없이)', async () => {
    const { make, post, sensor } = await fixture()
    const s = await make('복도')
    expect((await post(s.token, 'heartbeat', {})).status).toBe(200)
    const state = await sensor(s.id)
    expect(state).toMatchObject({ state: 'ONLINE', batteryPercent: null, batteryLevel: 'UNKNOWN' })
  })
})

describe('연결 상태 전환: OFFLINE·복구', () => {
  it('설정한 시간 동안 신호가 없으면 OFFLINE 이 되고 끊김 이력·알림이 남고, 신호가 다시 오면 ONLINE 과 복구 알림이 된다', async () => {
    const { ctx, make, sensor, alerts, check, statusLogs } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat()
    expect((await sensor(s.id)).state).toBe('ONLINE')

    ctx.clock.advance(4 * MINUTE) // 기준(기본 5분) 안
    expect((await sensor(s.id)).state).toBe('ONLINE')
    ctx.clock.advance(2 * MINUTE)
    expect((await sensor(s.id)).state).toBe('OFFLINE')
    await check()
    await check() // 점검을 되풀이해도 이력·알림은 한 번만
    expect((await statusLogs(s.id)).map((l) => l.kind)).toEqual(['CONNECTED', 'DISCONNECTED'])
    expect((await alerts()).map((a) => a.type)).toEqual(['SENSOR_OFFLINE'])

    await s.device.heartbeat()
    expect((await sensor(s.id)).state).toBe('ONLINE')
    expect((await statusLogs(s.id)).map((l) => l.kind)).toEqual([
      'CONNECTED',
      'DISCONNECTED',
      'CONNECTED',
    ])
    const list = await alerts()
    expect(list.map((a) => a.type).sort()).toEqual(['SENSOR_OFFLINE', 'SENSOR_RESTORED'])
    expect(list.find((a) => a.type === 'SENSOR_OFFLINE')?.status).toBe('RESOLVED')
  })

  it('센서별 타임아웃: 신호 간격이 긴 센서는 더 늦게 끊김으로 본다 (가구 기본은 그대로)', async () => {
    const { ctx, client, make, sensor, check, alerts } = await fixture()
    const slow = await make('배터리 센서', 'BED_SIDE')
    const normal = await make('일반 센서', 'PATH')
    const res = await client.request(`/api/sensors/${slow.id}`, {
      method: 'PATCH',
      body: { offlineAfterSeconds: 1800 },
    })
    expect(res.status).toBe(200)
    await slow.device.heartbeat()
    await normal.device.heartbeat()

    ctx.clock.advance(10 * MINUTE)
    expect(await sensor(slow.id)).toMatchObject({
      state: 'ONLINE',
      effectiveOfflineAfterSeconds: 1800,
      offlineAfterSeconds: 1800,
    })
    expect(await sensor(normal.id)).toMatchObject({
      state: 'OFFLINE',
      effectiveOfflineAfterSeconds: 300,
      offlineAfterSeconds: null,
    })
    await check()
    expect((await alerts()).map((a) => a.title)).toEqual([expect.stringContaining('일반 센서')])

    ctx.clock.advance(25 * MINUTE)
    expect((await sensor(slow.id)).state).toBe('OFFLINE')
  })

  it('센서별 타임아웃의 범위(60~3600초)를 검사하고, null 이면 가구 기본으로 돌아간다', async () => {
    const { client, make, sensor } = await fixture()
    const s = await make('복도')
    for (const bad of [59, 3601, 1.5, 'abc']) {
      const res = await client.request(`/api/sensors/${s.id}`, {
        method: 'PATCH',
        body: { offlineAfterSeconds: bad },
      })
      expect(res.status, String(bad)).toBe(400)
    }
    await client.request(`/api/sensors/${s.id}`, {
      method: 'PATCH',
      body: { offlineAfterSeconds: 600 },
    })
    expect((await sensor(s.id)).effectiveOfflineAfterSeconds).toBe(600)
    await client.request(`/api/sensors/${s.id}`, {
      method: 'PATCH',
      body: { offlineAfterSeconds: null },
    })
    expect(await sensor(s.id)).toMatchObject({
      offlineAfterSeconds: null,
      effectiveOfflineAfterSeconds: 300,
    })
  })

  it('장시간 미응답: 끊긴 채 1시간 넘게 신호가 없으면 longSilent, 그 전에는 아니다', async () => {
    const { ctx, make, sensor } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat()
    ctx.clock.advance(20 * MINUTE)
    expect(await sensor(s.id)).toMatchObject({
      state: 'OFFLINE',
      longSilent: false,
      silentSeconds: 1200,
    })
    ctx.clock.advance(LONG_SILENT_SECONDS * 1000)
    expect(await sensor(s.id)).toMatchObject({ state: 'OFFLINE', longSilent: true })
  })

  it('신호가 한 번도 없는 센서는 PENDING 이고 미응답 시간이 없다 (끊김 알림도 없다)', async () => {
    const { ctx, make, sensor, check, alerts } = await fixture()
    const s = await make('복도')
    ctx.clock.advance(3 * 60 * MINUTE)
    expect(await sensor(s.id)).toMatchObject({
      state: 'PENDING',
      silentSeconds: null,
      longSilent: false,
      lastSeenAt: null,
    })
    await check()
    expect(await alerts()).toEqual([])
  })

  it('비활성(사용 안 함) 센서는 DISABLED 로 표시되고 신호가 없어도 끊김 알림이 없다', async () => {
    const { ctx, client, make, sensor, check, alerts } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat()
    await client.request(`/api/sensors/${s.id}`, { method: 'PATCH', body: { isActive: false } })
    ctx.clock.advance(2 * 60 * MINUTE)
    expect((await sensor(s.id)).state).toBe('DISABLED')
    await check()
    expect(await alerts()).toEqual([])
  })
})

describe('배터리', () => {
  it('배터리 정보가 없는 센서는 UNKNOWN 이고 잔량을 만들어 내지 않는다. 보고하면 그 값만 쓴다', async () => {
    const { make, sensor } = await fixture()
    const s = await make('복도')
    await s.device.motion()
    await s.device.heartbeat()
    expect(await sensor(s.id)).toMatchObject({ batteryPercent: null, batteryLevel: 'UNKNOWN' })
    await s.device.heartbeat({ batteryPercent: 64 })
    expect(await sensor(s.id)).toMatchObject({ batteryPercent: 64, batteryLevel: 'OK' })
    await s.device.heartbeat() // 값을 안 보내도 이전 값을 지우거나 바꾸지 않는다
    expect((await sensor(s.id)).batteryPercent).toBe(64)
  })

  it('임계값 이하로 처음 들어갈 때만 알림이 만들어지고, 같은 수준이 반복되어도 다시 알리지 않는다', async () => {
    const { ctx, make, alerts, statusLogs } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat({ batteryPercent: 80 })
    await s.device.heartbeat({ batteryPercent: 19 }) // 기본 부족 기준 20% 이하
    await s.device.heartbeat({ batteryPercent: 18 })
    await s.device.heartbeat({ batteryPercent: 17 })
    expect((await alerts()).filter((a) => a.type === 'LOW_BATTERY')).toHaveLength(1)
    expect((await statusLogs(s.id)).filter((l) => l.kind === 'BATTERY_LOW')).toHaveLength(1)

    await s.device.heartbeat({ batteryPercent: 9 }) // 위급(10% 이하)으로 악화 → 같은 알림이 승격
    const low = (await alerts()).filter((a) => a.type === 'LOW_BATTERY')
    expect(low).toHaveLength(1)
    expect(low[0]?.severity).toBe('NOTICE')

    await s.device.heartbeat({ batteryPercent: 90 }) // 회복 → 알림 자동 종료
    await ctx.services.pipeline.reconcileSystemAlerts()
    expect((await alerts()).find((a) => a.type === 'LOW_BATTERY')?.status).toBe('RESOLVED')

    await s.device.heartbeat({ batteryPercent: 15 }) // 다시 들어가면 새 알림
    expect((await alerts()).filter((a) => a.type === 'LOW_BATTERY')).toHaveLength(2)
  })

  it('배터리 임계값 설정을 바꾸면 그 기준으로 판단한다', async () => {
    const { client, make, sensor } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat({ batteryPercent: 30 })
    expect((await sensor(s.id)).batteryLevel).toBe('OK')
    const current = (await (await client.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    const { updatedAt: _u, ...settings } = current
    await client.put('/api/settings/detection', {
      ...settings,
      lowBatteryPercent: 35,
      criticalBatteryPercent: 15,
    })
    expect((await sensor(s.id)).batteryLevel).toBe('LOW')
  })
})

describe('데이터 수신 오류·비정상 데이터', () => {
  it('거부된 이벤트(너무 오래됨·미래 시각)는 저장하지 않고 센서의 수신 오류로 기록한다', async () => {
    const { ctx, make, post, sensor } = await fixture()
    const s = await make('복도')
    const old = new Date(ctx.clock.now().getTime() - 25 * 60 * MINUTE).toISOString()
    const future = new Date(ctx.clock.now().getTime() + 10 * MINUTE).toISOString()
    const res = await post(s.token, 'events', {
      events: [
        { eventId: randomUUID(), type: 'MOTION', occurredAt: old },
        { eventId: randomUUID(), type: 'MOTION', occurredAt: future },
      ],
    })
    expect(res.status).toBe(200)
    const state = await sensor(s.id)
    expect(state.receiveErrors).toMatchObject({ count: 2, lastReason: 'FUTURE_TIMESTAMP' })
    expect(state.receiveErrors.lastAt).toBe(ctx.clock.now().toISOString())
    expect(await ctx.prisma.movementEvent.count()).toBe(0)
    // 거부된 데이터를 받았다는 것은 센서가 살아 있다는 뜻이라 연결 상태는 ONLINE 이다.
    expect(state.state).toBe('ONLINE')
  })

  it('형식이 틀린 요청(범위 밖 배터리·빈 이벤트·알 수 없는 형식)은 400 이고 수신 오류로 기록되며 값은 바뀌지 않는다', async () => {
    const { make, post, sensor } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat({ batteryPercent: 70 })
    expect((await post(s.token, 'heartbeat', { batteryPercent: 150 })).status).toBe(400)
    expect((await post(s.token, 'heartbeat', { batteryPercent: -3 })).status).toBe(400)
    expect((await post(s.token, 'heartbeat', { batteryPercent: 'low' })).status).toBe(400)
    expect((await post(s.token, 'events', { events: [] })).status).toBe(400)
    expect(
      (await post(s.token, 'events', { events: [{ eventId: 'x', type: 'MOTION' }] })).status,
    ).toBe(400)
    const state = await sensor(s.id)
    expect(state.receiveErrors.count).toBe(5)
    expect(state.receiveErrors.lastReason).toBe('INVALID_PAYLOAD')
    expect(state.batteryPercent).toBe(70) // 잘못된 값으로 덮어쓰지 않는다
  })

  it('중복 이벤트는 오류가 아니고, 정상 신호는 오류 횟수를 늘리지 않는다', async () => {
    const { make, post, sensor } = await fixture()
    const s = await make('복도')
    const id = randomUUID()
    await post(s.token, 'events', { events: [{ eventId: id, type: 'MOTION' }] })
    await post(s.token, 'events', { events: [{ eventId: id, type: 'MOTION' }] })
    expect((await sensor(s.id)).receiveErrors).toEqual({ count: 0, lastAt: null, lastReason: null })
  })

  it('틀린 토큰의 요청은 어떤 센서의 오류로도 기록되지 않는다 (401)', async () => {
    const { make, post, sensor } = await fixture()
    const s = await make('복도')
    expect((await post('tsn_forged', 'heartbeat', { batteryPercent: 150 })).status).toBe(401)
    expect((await sensor(s.id)).receiveErrors.count).toBe(0)
  })
})

describe('실시간 상태 업데이트와 서버 재시작 후 복원', () => {
  it('끊김·복구가 sensor.status 로 같은 가구의 화면에 전달되고, 화면이 읽는 REST 상태와 같다', async () => {
    const { ctx, client, make, check, sensor } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat()
    const screen = await openSocket(ctx.baseUrl, client)
    try {
      ctx.clock.advance(6 * MINUTE)
      await check()
      await screen.waitForCount('sensor.status', 1)
      const down = screen.of('sensor.status').at(-1)?.payload as { sensor: Sensor; change: string }
      expect(down.change).toBe('DISCONNECTED')
      expect(down.sensor.state).toBe('OFFLINE')
      expect(down.sensor.state).toBe((await sensor(s.id)).state)

      await s.device.heartbeat()
      await screen.waitForCount('sensor.status', 2)
      const up = screen.of('sensor.status').at(-1)?.payload as { sensor: Sensor; change: string }
      expect(up).toMatchObject({ change: 'CONNECTED' })
      expect(up.sensor.state).toBe('ONLINE')
    } finally {
      screen.close()
    }
  })

  it('서버를 다시 시작해도 상태가 DB 에서 복원되고, 끊김 이력·알림이 중복으로 만들어지지 않는다', async () => {
    const { ctx, make, sensor, alerts, statusLogs } = await fixture()
    const s = await make('복도')
    await s.device.heartbeat({ batteryPercent: 15 })
    ctx.clock.advance(6 * MINUTE)
    await ctx.services.pipeline.checkSensorConnections()
    const before = { alerts: (await alerts()).length, logs: (await statusLogs(s.id)).length }
    expect(before).toEqual({ alerts: 2, logs: 3 }) // 끊김·배터리 부족 알림 / 연결·배터리 부족·끊김 이력

    // 같은 DB 위에 서비스를 새로 만든다 (프로세스 재시작과 같다: 메모리 상태 없음)
    const restarted = createServices({
      prisma: ctx.prisma,
      logger: pino({ level: 'silent' }),
      now: ctx.clock.now,
    })
    await restarted.maintenance.tick()
    await restarted.maintenance.tick()
    expect((await alerts()).length).toBe(before.alerts)
    expect((await statusLogs(s.id)).length).toBe(before.logs)
    expect(await sensor(s.id)).toMatchObject({
      state: 'OFFLINE',
      batteryPercent: 15,
      batteryLevel: 'LOW',
    })

    // 재시작 뒤에 신호가 다시 오면 평소처럼 복구된다.
    await s.device.heartbeat({ batteryPercent: 15 })
    expect((await sensor(s.id)).state).toBe('ONLINE')
    expect((await alerts()).map((a) => a.type)).toContain('SENSOR_RESTORED')
  })
})
