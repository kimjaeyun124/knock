import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertDetailSchema,
  AlertListResponseSchema,
  AlertNotifyPayloadSchema,
  AlertPayloadSchema,
  DeliveryUpdatedPayloadSchema,
  EventCreatedPayloadSchema,
  FORBIDDEN_PHRASES,
  LATE_NOTE,
  SensorStatusPayloadSchema,
  type Alert,
  type AlertDetail,
} from '@tetris/shared'
import type { NotificationChannelAdapter } from '@/integrations/notifications/types'
import { DeliveryError } from '@/integrations/notifications/types'
import { createTestContext, type TestContext } from '@/test-utils/context'
import type { TestClient } from '@/test-utils/http'
import { DAY, MINUTE, NIGHT, TestDevice, openSocket, type TestSocket } from '@/test-utils/scenario'

const contexts: TestContext[] = []
const sockets: TestSocket[] = []
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close())
  for (const ctx of contexts.splice(0)) await ctx.close()
})

/** 야간(한국 02:00)으로 맞춘 테스트 환경: 보호자 1명, 침대·이동 경로·현관 센서 1개씩 */
async function fixture(options: Parameters<typeof createTestContext>[0] = {}) {
  const ctx = await createTestContext(options)
  contexts.push(ctx)
  ctx.clock.set(NIGHT)
  const user = await ctx.createHousehold()
  const client = await ctx.loginAs(user)
  const make = async (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE', name: string) => {
    const sensor = await ctx.createSensor(user.householdId, { zone, name })
    return { id: sensor.id, device: new TestDevice(ctx, sensor.token) }
  }
  const bed = await make('BED_SIDE', '침대 옆')
  const path = await make('PATH', '복도')
  const door = await make('ENTRANCE', '현관문')

  const alerts = async (query = ''): Promise<Alert[]> =>
    AlertListResponseSchema.parse(await (await client.get(`/api/alerts${query}`)).json()).alerts
  const detail = async (id: string): Promise<AlertDetail> =>
    AlertDetailSchema.parse(await (await client.get(`/api/alerts/${id}`)).json())
  const listen = async (as: TestClient = client) => {
    const s = await openSocket(ctx.baseUrl, as)
    sockets.push(s)
    return s
  }
  const setSensitivity = async (sensitivity: 'LOW' | 'MEDIUM' | 'HIGH') => {
    const current = (await (await client.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    const { updatedAt: _ignored, ...settings } = current
    const res = await client.put('/api/settings/detection', { ...settings, sensitivity })
    expect(res.status).toBe(200)
  }
  return { ctx, user, client, bed, path, door, alerts, detail, listen, setSensitivity }
}

describe('시나리오 1·2: 침대 주변 → 이동 경로', () => {
  it('보통 민감도: 침대 주변 다음 이동 경로 신호가 이어지면 "주의" 알림 하나와 근거 신호 2건이 생긴다', async () => {
    const { bed, path, alerts, detail } = await fixture()
    await bed.device.motion()
    expect(await alerts()).toHaveLength(0) // 침대 주변 신호 하나만으로는 알리지 않는다 (보통)

    await path.device.motion(2 * MINUTE)
    const [alert] = await alerts()
    expect(alert).toMatchObject({
      type: 'BED_TO_PATH',
      severity: 'NOTICE',
      status: 'OPEN',
      origin: 'REAL',
      title: '침대 주변에서 이동 경로로 움직임이 이어졌습니다',
      occurrences: 2,
    })
    const { evidence } = await detail(alert!.id)
    expect(evidence.map((e) => [e.sensorName, e.zone])).toEqual([
      ['침대 옆', 'BED_SIDE'],
      ['복도', 'PATH'],
    ])
  })

  it('정상적인 야간 이동(침대→화장실→침대)은 민감도 낮음에서 알림이 없고 기록만 남는다', async () => {
    const { ctx, user, bed, path, alerts, setSensitivity } = await fixture()
    await setSensitivity('LOW')
    await bed.device.motion()
    await path.device.motion(2 * MINUTE)
    await bed.device.motion(9 * MINUTE)
    expect(await alerts()).toHaveLength(0)
    expect(await ctx.prisma.movementEvent.count({ where: { householdId: user.householdId } })).toBe(
      3,
    )
  })

  it('낮에 발생한 신호는 알리지 않고, 야간에 발생했지만 늦게 도착한 신호는 알리되 늦게 도착했음을 밝힌다', async () => {
    const { bed, path, door, alerts } = await fixture()
    // 13시간 전(어제 한국 시각 13:00, 낮)에 발생한 현관 신호가 지금 도착: 발생 시각 기준으로 낮이므로 알리지 않는다
    await door.device.motion(-13 * 60 * MINUTE)
    expect(await alerts()).toHaveLength(0)

    await bed.device.motion(-10 * MINUTE)
    await path.device.motion(-8 * MINUTE) // 10분 전·8분 전에 발생한 신호가 이제야 도착
    const [alert] = await alerts()
    expect(alert?.type).toBe('BED_TO_PATH')
    expect(alert?.message.endsWith(LATE_NOTE)).toBe(true)
  })
})

describe('시나리오 3: 현관 접근', () => {
  it('야간 현관 신호는 "긴급" 알림이고, 앱 화면이 열려 있으면 알림 전달(IN_APP)이 성공으로 기록된다', async () => {
    const { door, client, alerts, detail, listen } = await fixture()
    const screen = await listen()

    await door.device.motion()
    const [alert] = await alerts()
    expect(alert).toMatchObject({
      type: 'ENTRANCE_APPROACH',
      severity: 'URGENT',
      status: 'OPEN',
      title: '현관 근처에서 움직임이 감지되었습니다',
    })

    // 실시간: 데이터 갱신(household) + 알림 전달(guardian) + 전달 결과
    await screen.waitForCount('alert.created', 1)
    await screen.waitForCount('alert.notify', 1)
    await screen.waitForCount('delivery.updated', 4)
    expect(AlertPayloadSchema.parse(screen.of('alert.created')[0]?.payload).alert.id).toBe(
      alert!.id,
    )
    expect(AlertNotifyPayloadSchema.parse(screen.of('alert.notify')[0]?.payload)).toMatchObject({
      reason: 'NEW',
      alert: { id: alert!.id, severity: 'URGENT' },
    })

    // 전달 기록: 앱 화면은 실제 연동으로 전달됨, 나머지 채널은 "연동되지 않음"으로 정직하게 남는다
    const { deliveries, alert: fresh } = await detail(alert!.id)
    const byChannel = Object.fromEntries(deliveries.map((d) => [d.channel, d]))
    expect(byChannel.IN_APP).toMatchObject({
      status: 'SENT',
      providerMode: 'REAL',
      attempts: 1,
      lastError: null,
    })
    for (const channel of ['WEB_PUSH', 'WATCH', 'SMS', 'KAKAO']) {
      expect(byChannel[channel], channel).toMatchObject({
        status: 'NOT_CONFIGURED',
        providerMode: null,
        attempts: 0,
      })
    }
    expect(fresh.delivery).toEqual({ sent: 1, pending: 0, failed: 0, notConfigured: 4 })
    void client
  })

  it('같은 현관 알림이 반복 억제 시간(10분) 안에 다시 생기면 새 알림 없이 근거 신호만 더한다', async () => {
    const { door, alerts, detail, listen } = await fixture()
    const screen = await listen()
    await door.device.motion()
    await screen.waitForCount('alert.notify', 1)

    await door.device.motion(3 * MINUTE)
    await door.device.motion(8 * MINUTE)
    const list = await alerts()
    expect(list).toHaveLength(1)
    expect(list[0]?.occurrences).toBe(3)
    expect((await detail(list[0]!.id)).evidence).toHaveLength(3)

    await screen.waitForCount('alert.updated', 2)
    expect(screen.of('alert.created')).toHaveLength(1)
    expect(screen.of('alert.notify')).toHaveLength(1) // 합쳐진 신호로는 다시 알리지 않는다
  })

  it('반복 억제 시간이 지난 뒤의 신호는 새 알림이 된다', async () => {
    const { door, alerts } = await fixture()
    await door.device.motion()
    await door.device.motion(11 * MINUTE)
    expect(await alerts()).toHaveLength(2)
  })

  it('보호자가 확인한 알림에도 억제 시간 안의 신호는 합쳐지지만, 종료한 알림 뒤의 신호는 새 알림이다', async () => {
    const { client, door, alerts } = await fixture()
    await door.device.motion()
    const [first] = await alerts()
    await client.post(`/api/alerts/${first!.id}/acknowledge`)
    await door.device.motion(2 * MINUTE)
    expect(await alerts()).toHaveLength(1)
    expect((await alerts())[0]).toMatchObject({ status: 'ACKNOWLEDGED', occurrences: 2 })

    await client.post(`/api/alerts/${first!.id}/resolve`, { resolution: 'CHECKED' })
    await door.device.motion(4 * MINUTE)
    const list = await alerts()
    expect(list).toHaveLength(2)
    expect(list.filter((a) => a.status === 'OPEN')).toHaveLength(1)
  })

  it('침대 → 이동 경로 → 현관 순서: 이동 흐름(주의)과 현관(긴급) 알림이 따로 생긴다', async () => {
    const { bed, path, door, alerts } = await fixture()
    await bed.device.motion()
    await path.device.motion(1 * MINUTE)
    await door.device.motion(2 * MINUTE)
    const list = await alerts()
    expect(list.map((a) => [a.type, a.severity]).sort()).toEqual([
      ['BED_TO_PATH', 'NOTICE'],
      ['ENTRANCE_APPROACH', 'URGENT'],
    ])
  })

  it('낮에 현관 신호가 와도 알림은 없고 기록만 남는다', async () => {
    const { ctx, user, door, alerts } = await fixture()
    ctx.clock.set(DAY)
    await door.device.motion()
    expect(await alerts()).toHaveLength(0)
    expect(await ctx.prisma.movementEvent.count({ where: { householdId: user.householdId } })).toBe(
      1,
    )
  })

  it('여러 신호가 동시에 들어와도 알림은 하나이고 신호 수가 정확히 합쳐진다 (경쟁 상태 없음)', async () => {
    const { door, alerts } = await fixture()
    await Promise.all(Array.from({ length: 6 }, (_, i) => door.device.motion(i * 1000)))
    const list = await alerts()
    expect(list).toHaveLength(1)
    expect(list[0]?.occurrences).toBe(6)
  })
})

describe('시나리오 4: 짧은 시간 안의 반복 이동', () => {
  it('민감도 높음: 30분 안에 구역이 3번 바뀌면 알린다', async () => {
    const { bed, path, alerts, setSensitivity } = await fixture()
    await setSensitivity('HIGH')
    await bed.device.motion()
    await path.device.motion(1 * MINUTE)
    await bed.device.motion(2 * MINUTE)
    await path.device.motion(3 * MINUTE)
    const types = (await alerts()).map((a) => a.type)
    expect(types).toContain('REPEATED_MOVEMENT')
    expect(types).toContain('BED_AREA_ACTIVITY') // 높음: 침대 주변 신호 하나만으로도 알림
  })

  it('보통 민감도에서는 3번 바뀌어도 반복 이동 알림이 없다', async () => {
    const { bed, path, alerts } = await fixture()
    await bed.device.motion()
    await path.device.motion(1 * MINUTE)
    await bed.device.motion(2 * MINUTE)
    await path.device.motion(3 * MINUTE)
    expect((await alerts()).map((a) => a.type)).not.toContain('REPEATED_MOVEMENT')
  })
})

describe('시나리오 5: 센서 연결 끊김·배터리', () => {
  it('신호가 5분 넘게 없으면 주기 점검이 연결 끊김 알림을 한 번만 만들고, 신호가 돌아오면 자동 종료한다', async () => {
    const { ctx, user, bed, alerts, listen, client } = await fixture()
    const screen = await listen()
    await bed.device.heartbeat()

    ctx.clock.advance(5 * MINUTE)
    await ctx.services.maintenance.tick()
    expect(await alerts()).toHaveLength(0) // 정확히 5분은 아직 연결됨

    ctx.clock.advance(1_000)
    await ctx.services.maintenance.tick()
    await ctx.services.maintenance.tick() // 다시 점검해도 중복 없음
    ctx.clock.advance(30_000)
    await ctx.services.maintenance.tick() // 시간이 더 지나도 같은 상태라면 화면에 갱신을 반복해서 보내지 않는다
    const [offline] = await alerts()
    expect(offline).toMatchObject({
      type: 'SENSOR_OFFLINE',
      severity: 'URGENT', // 침대 주변 구역의 유일한 센서
      sensorName: '침대 옆',
    })
    expect(offline?.message).toContain('5분 이상 신호가 없습니다')
    expect(offline?.message).toContain('확인되지 않습니다')
    expect(await alerts()).toHaveLength(1)
    const logs = await ctx.prisma.sensorStatusLog.findMany({
      where: { sensorId: offline!.sensorId! },
      orderBy: { at: 'asc' },
    })
    expect(logs.map((l) => l.kind)).toEqual(['CONNECTED', 'DISCONNECTED'])

    await screen.waitForCount('alert.created', 1)
    await screen.waitForCount('alert.notify', 1)
    expect(screen.of('alert.created')).toHaveLength(1)
    expect(screen.of('alert.updated')).toHaveLength(0)
    expect(
      screen.of('sensor.status').map((r) => SensorStatusPayloadSchema.parse(r.payload)),
    ).toContainEqual(expect.objectContaining({ change: 'DISCONNECTED' }))
    const sensorState = (await (await client.get(`/api/sensors/${offline!.sensorId}`)).json()) as {
      sensor: { state: string }
    }
    expect(sensorState.sensor.state).toBe('OFFLINE')

    // 복구: 신호가 다시 오면 알림이 자동으로 종료된다
    await bed.device.heartbeat()
    const recovered = (await alerts())[0]
    expect(recovered).toMatchObject({ status: 'RESOLVED', resolution: 'AUTO_RESOLVED' })
    const kinds = (
      await ctx.prisma.sensorStatusLog.findMany({
        where: { sensorId: offline!.sensorId! },
        orderBy: { at: 'asc' },
      })
    ).map((l) => l.kind)
    expect(kinds).toEqual(['CONNECTED', 'DISCONNECTED', 'CONNECTED'])
    void user
  })

  it('다시 끊기면 새 알림이 생긴다', async () => {
    const { ctx, bed, alerts } = await fixture()
    await bed.device.heartbeat()
    ctx.clock.advance(6 * MINUTE)
    await ctx.services.maintenance.tick()
    await bed.device.heartbeat()
    ctx.clock.advance(6 * MINUTE)
    await ctx.services.maintenance.tick()
    const list = await alerts()
    expect(list.filter((a) => a.type === 'SENSOR_OFFLINE')).toHaveLength(2)
    expect(list.filter((a) => a.status !== 'RESOLVED')).toHaveLength(1)
  })

  it('같은 구역에 다른 센서가 더 있으면 "주의", 유일하면 "긴급"이다', async () => {
    const { ctx, user, bed, alerts } = await fixture()
    const second = await ctx.createSensor(user.householdId, { zone: 'BED_SIDE', name: '침대 발치' })
    await bed.device.heartbeat()
    await new TestDevice(ctx, second.token).heartbeat()
    ctx.clock.advance(6 * MINUTE)
    // 한 센서만 신호를 계속 보낸다
    await new TestDevice(ctx, second.token).heartbeat()
    await ctx.services.maintenance.tick()
    const [offline] = await alerts()
    expect(offline).toMatchObject({
      type: 'SENSOR_OFFLINE',
      severity: 'NOTICE',
      sensorName: '침대 옆',
    })
  })

  it('한 번도 신호를 받지 않은 센서(첫 신호 대기)와 "사용 안 함" 센서는 연결 끊김 알림을 만들지 않는다', async () => {
    const { ctx, user, alerts } = await fixture()
    const off = await ctx.createSensor(user.householdId, { name: '꺼 둔 센서', isActive: false })
    await new TestDevice(ctx, off.token).heartbeat().catch(() => undefined)
    ctx.clock.advance(60 * MINUTE)
    await ctx.services.maintenance.tick()
    expect(await alerts()).toHaveLength(0)
  })

  it('끊김 알림이 열려 있는 센서를 "사용 안 함"으로 바꾸면 알림이 자동 종료된다', async () => {
    const { ctx, user, client, bed, alerts } = await fixture()
    await bed.device.heartbeat()
    ctx.clock.advance(6 * MINUTE)
    await ctx.services.maintenance.tick()
    expect((await alerts())[0]?.status).toBe('OPEN')

    await client.request(`/api/sensors/${bed.id}`, { method: 'PATCH', body: { isActive: false } })
    await ctx.services.maintenance.tick()
    expect((await alerts())[0]).toMatchObject({ status: 'RESOLVED', resolution: 'AUTO_RESOLVED' })
    void user
  })

  it('끊김 판단 기준은 보호자가 정한 시간(offlineAfterSeconds)을 따른다', async () => {
    const { ctx, client, bed, alerts } = await fixture()
    const current = (await (await client.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    const { updatedAt: _ignored, ...settings } = current
    await client.put('/api/settings/detection', { ...settings, offlineAfterSeconds: 60 })
    await bed.device.heartbeat()
    ctx.clock.advance(61_000)
    await ctx.services.maintenance.tick()
    expect((await alerts())[0]?.type).toBe('SENSOR_OFFLINE')
  })

  it('배터리: 부족(정보, 별도 알림 없음) → 위급(주의로 격상, 알림 전달) → 회복(자동 종료)', async () => {
    const { ctx, bed, alerts, detail, listen } = await fixture()
    const screen = await listen()

    await bed.device.heartbeat({ batteryPercent: 18 })
    const [low] = await alerts()
    expect(low).toMatchObject({ type: 'LOW_BATTERY', severity: 'INFO', status: 'OPEN' })
    expect(low?.title).toContain('18%')
    expect((await detail(low!.id)).deliveries).toEqual([]) // 정보 수준은 알림을 보내지 않는다
    await screen.waitForCount('alert.created', 1)
    expect(screen.of('alert.notify')).toHaveLength(0)

    await bed.device.heartbeat({ batteryPercent: 7 })
    const list = await alerts()
    expect(list).toHaveLength(1) // 같은 알림이 격상된다
    expect(list[0]).toMatchObject({ id: low!.id, severity: 'NOTICE', status: 'OPEN' })
    expect(list[0]?.title).toContain('거의 없습니다')
    await screen.waitForCount('alert.notify', 1)
    expect(AlertNotifyPayloadSchema.parse(screen.of('alert.notify')[0]?.payload).reason).toBe(
      'ESCALATED',
    )

    await bed.device.heartbeat({ batteryPercent: 80 })
    expect((await alerts())[0]).toMatchObject({ status: 'RESOLVED', resolution: 'AUTO_RESOLVED' })
    void ctx
  })
})

describe('시나리오 6: 알림 전달 실패는 숨기지 않는다', () => {
  it('앱 화면이 열려 있지 않으면 30초·2분 뒤 다시 시도하고, 끝내 실패하면 "전달하지 못했습니다" 알림을 한 번 남긴다', async () => {
    const { ctx, door, alerts, detail } = await fixture()
    await door.device.motion() // 열려 있는 화면 없음
    const [entrance] = await alerts()
    let delivery = (await detail(entrance!.id)).deliveries.find((d) => d.channel === 'IN_APP')
    expect(delivery).toMatchObject({ status: 'PENDING', attempts: 1 })
    expect(delivery?.lastError).toContain('열려 있지 않습니다')

    ctx.clock.advance(29_000)
    await ctx.services.maintenance.tick()
    expect(
      (await detail(entrance!.id)).deliveries.find((d) => d.channel === 'IN_APP')?.attempts,
    ).toBe(1) // 아직 때가 아님

    ctx.clock.advance(1_000)
    await ctx.services.maintenance.tick()
    delivery = (await detail(entrance!.id)).deliveries.find((d) => d.channel === 'IN_APP')
    expect(delivery).toMatchObject({ status: 'PENDING', attempts: 2 })
    expect((await alerts()).map((a) => a.type)).not.toContain('DELIVERY_FAILED')

    ctx.clock.advance(120_000)
    await ctx.services.maintenance.tick()
    const detailNow = await detail(entrance!.id)
    expect(detailNow.deliveries.find((d) => d.channel === 'IN_APP')).toMatchObject({
      status: 'FAILED',
      attempts: 3,
    })
    expect(detailNow.alert.delivery).toEqual({ sent: 0, pending: 0, failed: 1, notConfigured: 4 })

    const failed = (await alerts('?type=DELIVERY_FAILED'))[0]
    expect(failed).toMatchObject({ type: 'DELIVERY_FAILED', severity: 'URGENT', status: 'OPEN' })
    expect(failed?.message).toContain('현관 근처에서 움직임이 감지되었습니다')

    // 이후 점검을 계속해도 전달 실패 알림이 늘어나거나 서로를 부르지 않는다
    for (let i = 0; i < 6; i += 1) {
      ctx.clock.advance(2 * MINUTE)
      await ctx.services.maintenance.tick()
    }
    expect(await alerts('?type=DELIVERY_FAILED')).toHaveLength(1)
  })

  it('재시도하는 사이 보호자가 앱을 열면 전달이 성공하고 전달 실패 알림은 생기지 않는다', async () => {
    const { ctx, door, alerts, detail, listen } = await fixture()
    await door.device.motion()
    const [entrance] = await alerts()

    const screen = await listen() // 보호자가 앱을 연다
    ctx.clock.advance(30_000)
    await ctx.services.maintenance.tick()
    await screen.waitForCount('alert.notify', 1)
    expect(
      (await detail(entrance!.id)).deliveries.find((d) => d.channel === 'IN_APP'),
    ).toMatchObject({
      status: 'SENT',
      attempts: 2,
    })
    expect(await alerts('?type=DELIVERY_FAILED')).toHaveLength(0)
  })

  it('재시도 중에 보호자가 알림을 확인하면 남은 전달은 취소되고 전달 실패로 취급하지 않는다', async () => {
    const { ctx, client, door, alerts, detail } = await fixture()
    await door.device.motion()
    const [entrance] = await alerts()
    await client.post(`/api/alerts/${entrance!.id}/acknowledge`)

    ctx.clock.advance(30_000)
    await ctx.services.maintenance.tick()
    expect(
      (await detail(entrance!.id)).deliveries.find((d) => d.channel === 'IN_APP'),
    ).toMatchObject({
      status: 'CANCELLED',
    })
    expect(await alerts('?type=DELIVERY_FAILED')).toHaveLength(0)
  })

  it('다른 가구 보호자의 화면은 이 가구의 알림을 받지 않는다', async () => {
    const { ctx, door, listen } = await fixture()
    const other = await ctx.createHousehold()
    const otherClient = await ctx.loginAs(other)
    const mine = await listen()
    const theirs = await listen(otherClient)

    await door.device.motion()
    await mine.waitForCount('alert.notify', 1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(theirs.received.map((r) => r.event)).toEqual(['server:ready'])
  })

  it('같은 가구의 다른 보호자가 화면을 열어 둔 경우, 그 보호자의 전달은 성공하므로 전달 실패 알림은 없다', async () => {
    const { ctx, user, door, alerts, detail } = await fixture()
    const second = await ctx.prisma.guardian.create({
      data: {
        householdId: user.householdId,
        email: 'second@example.com',
        displayName: '두 번째 보호자',
        passwordHash: (
          await ctx.prisma.guardian.findUniqueOrThrow({ where: { id: user.guardianId } })
        ).passwordHash,
      },
    })
    const secondClient = await ctx.loginAs({ ...user, email: second.email })
    const screen = await openSocket(ctx.baseUrl, secondClient)
    sockets.push(screen)

    await door.device.motion()
    const [entrance] = await alerts()
    await screen.waitForCount('alert.notify', 1)
    const inApp = (await detail(entrance!.id)).deliveries.filter((d) => d.channel === 'IN_APP')
    expect(Object.fromEntries(inApp.map((d) => [d.guardianName, d.status]))).toEqual({
      '두 번째 보호자': 'SENT',
      '테스트 보호자': 'PENDING',
    })

    // 첫 보호자는 끝내 못 받아도 한 명이 받았으므로 전달 실패 알림은 만들지 않는다
    for (let i = 0; i < 4; i += 1) {
      ctx.clock.advance(2 * MINUTE)
      await ctx.services.maintenance.tick()
    }
    expect(await alerts('?type=DELIVERY_FAILED')).toHaveLength(0)
  })
})

describe('전달 채널 어댑터', () => {
  class FakeExternal implements NotificationChannelAdapter {
    readonly channel = 'SMS' as const
    readonly external = true
    sent: string[] = []
    constructor(private readonly outcome: 'ok' | 'fail') {}
    mode() {
      return 'MOCK' as const
    }
    send(message: { alert: Alert }): Promise<void> {
      this.sent.push(message.alert.title)
      return this.outcome === 'ok'
        ? Promise.resolve()
        : Promise.reject(new DeliveryError('문자 서비스 응답 없음'))
    }
    sendTest(): Promise<void> {
      return Promise.resolve()
    }
  }

  it('실연동이 아닌(MOCK) 채널은 전달 기록에 MOCK 으로 남는다', async () => {
    const sms = new FakeExternal('ok')
    const { door, alerts, detail } = await fixture({ adapters: () => [sms] })
    await door.device.motion()
    const [alert] = await alerts()
    expect((await detail(alert!.id)).deliveries).toEqual([
      expect.objectContaining({ channel: 'SMS', providerMode: 'MOCK', status: 'SENT' }),
    ])
    expect(sms.sent).toEqual(['현관 근처에서 움직임이 감지되었습니다'])
  })

  it('시뮬레이터가 만든 알림은 앱 밖으로 나가는 채널로 보내지 않는다', async () => {
    const sms = new FakeExternal('ok')
    const { ctx, user, alerts, detail } = await fixture({ adapters: () => [sms] })
    const sim = await ctx.createSensor(user.householdId, {
      zone: 'ENTRANCE',
      origin: 'SIMULATED',
      name: '시뮬 현관',
    })
    await new TestDevice(ctx, sim.token).motion()
    const [alert] = await alerts()
    expect(alert).toMatchObject({ type: 'ENTRANCE_APPROACH', origin: 'SIMULATED' })
    expect((await detail(alert!.id)).deliveries).toEqual([])
    expect(sms.sent).toEqual([])
  })

  it('실제 센서와 시뮬레이터 신호는 서로 섞어서 판단하지 않는다', async () => {
    const { ctx, user, bed, alerts } = await fixture()
    const simPath = await ctx.createSensor(user.householdId, {
      zone: 'PATH',
      origin: 'SIMULATED',
      name: '시뮬 복도',
    })
    await bed.device.motion() // 실제 침대 주변
    await new TestDevice(ctx, simPath.token).motion(1 * MINUTE) // 시뮬레이션 이동 경로
    expect(await alerts()).toHaveLength(0)
  })

  it('채널이 실패하면 그 사유가 전달 기록에 남고, 모든 채널이 실패하면 전달 실패 알림이 생긴다', async () => {
    const sms = new FakeExternal('fail')
    const { ctx, door, alerts, detail } = await fixture({ adapters: () => [sms] })
    await door.device.motion()
    for (const seconds of [30, 120]) {
      ctx.clock.advance(seconds * 1000)
      await ctx.services.maintenance.tick()
    }
    const [entrance] = await alerts('?type=ENTRANCE_APPROACH')
    expect((await detail(entrance!.id)).deliveries[0]).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastError: '문자 서비스 응답 없음',
    })
    expect(await alerts('?type=DELIVERY_FAILED')).toHaveLength(1)
  })
})

describe('긴급 알림 재알림', () => {
  it('확인하지 않은 긴급 알림은 5분 간격으로 최대 3번 다시 알린다', async () => {
    const { ctx, door, alerts, listen } = await fixture()
    const screen = await listen()
    await door.device.motion()
    await screen.waitForCount('alert.notify', 1)

    ctx.clock.advance(4 * MINUTE)
    await door.device.heartbeat()
    await ctx.services.maintenance.tick()
    expect((await alerts())[0]?.reminderCount).toBe(0)

    for (let i = 1; i <= 5; i += 1) {
      ctx.clock.advance(5 * MINUTE)
      await door.device.heartbeat() // 센서가 살아 있어야 연결 끊김 알림이 섞이지 않는다
      await ctx.services.maintenance.tick()
    }
    expect((await alerts())[0]?.reminderCount).toBe(3) // 최대 3번
    await screen.waitForCount('alert.notify', 4)
    const reasons = screen
      .of('alert.notify')
      .map((r) => AlertNotifyPayloadSchema.parse(r.payload).reason)
    expect(reasons).toEqual(['NEW', 'REMINDER', 'REMINDER', 'REMINDER'])
  })

  it('확인하면 재알림을 멈추고, 주의(NOTICE) 알림은 재알림하지 않는다', async () => {
    const { ctx, client, door, bed, path, alerts } = await fixture()
    await door.device.motion()
    await bed.device.motion(1 * MINUTE)
    await path.device.motion(2 * MINUTE)
    const list = await alerts()
    const entrance = list.find((a) => a.type === 'ENTRANCE_APPROACH')!
    await client.post(`/api/alerts/${entrance.id}/acknowledge`)

    ctx.clock.advance(20 * MINUTE)
    await ctx.services.maintenance.tick()
    for (const alert of await alerts()) expect(alert.reminderCount, alert.type).toBe(0)
  })

  it('재알림 간격은 보호자 설정(reminderMinutes)을 따른다', async () => {
    const { ctx, client, door, alerts } = await fixture()
    const current = (await (await client.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    const { updatedAt: _ignored, ...settings } = current
    await client.put('/api/settings/detection', { ...settings, reminderMinutes: 1 })
    await door.device.motion()
    ctx.clock.advance(61_000)
    await ctx.services.maintenance.tick()
    expect((await alerts())[0]?.reminderCount).toBe(1)
  })
})

describe('실시간 발행', () => {
  it('센서 신호가 저장되면 같은 가구의 화면이 event.created 를 받는다', async () => {
    const { bed, listen } = await fixture()
    const screen = await listen()
    await bed.device.motion()
    await screen.waitForCount('event.created', 1)
    expect(
      EventCreatedPayloadSchema.parse(screen.of('event.created')[0]?.payload).event,
    ).toMatchObject({
      sensorName: '침대 옆',
      zone: 'BED_SIDE',
      origin: 'REAL',
    })
  })

  it('전달 결과(delivery.updated)가 스키마대로 발행된다', async () => {
    const { door, listen } = await fixture()
    const screen = await listen()
    await door.device.motion()
    await screen.waitForCount('delivery.updated', 4)
    for (const r of screen.of('delivery.updated')) DeliveryUpdatedPayloadSchema.parse(r.payload)
  })

  it('설정을 바꾸면 열려 있는 다른 화면이 settings.updated 를 받는다', async () => {
    const { client, listen, setSensitivity } = await fixture()
    const screen = await listen()
    await setSensitivity('HIGH')
    await screen.waitForCount('settings.updated', 1)
    expect(
      (screen.of('settings.updated')[0]?.payload as { settings: { sensitivity: string } }).settings
        .sensitivity,
    ).toBe('HIGH')
    void client
  })

  it('알림을 확인·종료하면 alert.updated 가 발행된다', async () => {
    const { client, door, alerts, listen } = await fixture()
    const screen = await listen()
    await door.device.motion()
    const [alert] = await alerts()
    await client.post(`/api/alerts/${alert!.id}/acknowledge`)
    await client.post(`/api/alerts/${alert!.id}/resolve`, {
      resolution: 'FALSE_ALARM',
      note: '화장실 다녀오심',
    })
    await screen.waitForCount('alert.updated', 2)
    const states = screen
      .of('alert.updated')
      .map((r) => AlertPayloadSchema.parse(r.payload).alert.status)
    expect(states).toEqual(['ACKNOWLEDGED', 'RESOLVED'])
  })
})

describe('기록 보관 기간', () => {
  it('보관 기간(기본 90일)이 지난 움직임 기록·종료된 알림·센서 이력만 지운다', async () => {
    const { ctx, user, client, door, bed, alerts } = await fixture()
    await door.device.motion()
    await bed.device.heartbeat()
    const [alert] = await alerts()
    await client.post(`/api/alerts/${alert!.id}/resolve`, { resolution: 'CHECKED' })
    await door.device.motion(11 * MINUTE) // 새 알림 (열려 있음)

    ctx.clock.advance(91 * 24 * 60 * MINUTE)
    await door.device.heartbeat() // 오래 뒤에도 센서는 살아 있다
    const result = await ctx.services.maintenance.purgeOldData()
    expect(result.events).toBe(2)
    expect(result.alerts).toBe(1) // 종료된 알림만
    expect(result.statusLogs).toBeGreaterThanOrEqual(1)

    // 91일이 지나 로그인 세션도 만료되었으므로 API 대신 DB 에서 직접 확인한다.
    const left = await ctx.prisma.alert.findMany({ where: { householdId: user.householdId } })
    expect(left.map((a) => a.status)).toEqual(['OPEN'])
    expect(await ctx.prisma.movementEvent.count({ where: { householdId: user.householdId } })).toBe(
      0,
    )
  })

  it('보관 기간은 보호자 설정(retentionDays)을 따르고, 최근 기록은 지우지 않는다', async () => {
    const { ctx, client, user, door } = await fixture()
    const current = (await (await client.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    const { updatedAt: _ignored, ...settings } = current
    await client.put('/api/settings/detection', { ...settings, retentionDays: 7 })
    await door.device.motion()
    ctx.clock.advance(6 * 24 * 60 * MINUTE)
    expect((await ctx.services.maintenance.purgeOldData()).events).toBe(0)
    ctx.clock.advance(2 * 24 * 60 * MINUTE)
    expect((await ctx.services.maintenance.purgeOldData()).events).toBe(1)
    expect(await ctx.prisma.movementEvent.count({ where: { householdId: user.householdId } })).toBe(
      0,
    )
  })
})

describe('알림 문구 원칙 (통합)', () => {
  it('실제로 만들어진 모든 알림의 제목·문구에 확정적·의학적 표현이 없다', async () => {
    const { ctx, bed, path, door, alerts, setSensitivity } = await fixture()
    await setSensitivity('HIGH')
    await bed.device.heartbeat({ batteryPercent: 5 })
    await bed.device.motion()
    await path.device.motion(1 * MINUTE)
    await door.device.motion(2 * MINUTE)
    await path.device.motion(3 * MINUTE)
    await bed.device.motion(4 * MINUTE)
    ctx.clock.advance(7 * MINUTE)
    await ctx.services.maintenance.tick()

    const all = await alerts()
    expect(all.length).toBeGreaterThanOrEqual(5)
    for (const alert of all) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(alert.title + alert.message, alert.type).not.toContain(phrase)
      }
    }
  })
})

describe('인식 정확도 개선 (서버 전체 경로)', () => {
  it('사용을 꺼 둔 침대 센서의 이전 신호는 침대→이동 경로 판단에 쓰지 않는다', async () => {
    const { client, bed, path, alerts } = await fixture()
    await bed.device.motion()
    // 침대 센서를 "사용 안 함"으로 바꾼 뒤 이동 경로 신호가 들어온다
    const res = await client.request(`/api/sensors/${bed.id}`, {
      method: 'PATCH',
      body: { isActive: false },
    })
    expect(res.status).toBe(200)
    await path.device.motion(1 * MINUTE)
    expect((await alerts()).map((a) => a.type)).not.toContain('BED_TO_PATH')
  })

  it('몇 초 사이로 번갈아 반응하는 이웃 센서는 여러 구역 이동으로 알리지 않는다 (민감도 높음)', async () => {
    const { bed, path, alerts, setSensitivity } = await fixture()
    await setSensitivity('HIGH')
    for (let i = 0; i < 6; i += 1) {
      await (i % 2 === 0 ? bed : path).device.motion(i * 3 * 1000)
    }
    expect((await alerts()).map((a) => a.type)).not.toContain('REPEATED_MOVEMENT')
  })

  it('현관 알림에 직전 침대 주변·이동 경로 움직임이 문구와 근거로 담기고 긴급 수준은 그대로다', async () => {
    const { bed, path, door, alerts, detail } = await fixture()
    await bed.device.motion()
    await path.device.motion(1 * MINUTE)
    await door.device.motion(2 * MINUTE)
    const entrance = (await alerts()).find((a) => a.type === 'ENTRANCE_APPROACH')
    expect(entrance?.severity).toBe('URGENT')
    expect(entrance?.message).toContain('침대 주변·이동 경로 구역에서도 움직임 신호가 있었습니다')
    expect((await detail(entrance!.id)).evidence).toHaveLength(3)
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(entrance!.title + entrance!.message).not.toContain(phrase)
    }
  })
})
