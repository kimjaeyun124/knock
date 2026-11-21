import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertDetailSchema,
  AlertListResponseSchema,
  AlertReadAllResponseSchema,
  AlertReadPayloadSchema,
  AlertResponseSchema,
  AlertUnreadCountResponseSchema,
  ApiErrorBodySchema,
  type AlertItem,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice, openSocket, type TestSocket } from '@/test-utils/scenario'

const contexts: TestContext[] = []
const sockets: TestSocket[] = []
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close())
  for (const ctx of contexts.splice(0)) await ctx.close()
})

/** 야간으로 맞춘 환경: 보호자 1명(+직접 만드는 두 번째 보호자), 센서 3개, 알림 여러 개 */
async function fixture() {
  const ctx = await createTestContext()
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

  const list = async (query = '', who = client): Promise<AlertItem[]> =>
    AlertListResponseSchema.parse(await (await who.get(`/api/alerts${query}`)).json()).alerts
  const unread = async (who = client) => {
    const res = await who.get('/api/alerts/unread-count')
    expect(res.status).toBe(200)
    return AlertUnreadCountResponseSchema.parse(await res.json())
  }
  const listen = async () => {
    const s = await openSocket(ctx.baseUrl, client)
    sockets.push(s)
    return s
  }
  /** 긴급(현관) + 주의(침대→경로) + 참고(배터리 부족) 알림 세 개 */
  const seedThree = async () => {
    await door.device.motion() // ENTRANCE_APPROACH 긴급
    await bed.device.motion(3 * MINUTE)
    await path.device.motion(5 * MINUTE) // BED_TO_PATH 주의
    await bed.device.heartbeat({ batteryPercent: 15 }) // LOW_BATTERY 참고
    const all = await list()
    expect(all).toHaveLength(3)
    return {
      urgent: all.find((a) => a.type === 'ENTRANCE_APPROACH')!,
      notice: all.find((a) => a.type === 'BED_TO_PATH')!,
      info: all.find((a) => a.type === 'LOW_BATTERY')!,
    }
  }
  const secondGuardian = async () =>
    ctx.prisma.guardian.create({
      data: {
        householdId: user.householdId,
        email: `second-${Date.now()}@example.com`,
        passwordHash: 'not-a-real-hash',
        displayName: '둘째 보호자',
        role: 'MEMBER',
      },
    })
  return { ctx, user, client, bed, path, door, list, unread, listen, seedThree, secondGuardian }
}

describe('읽음 처리와 읽지 않은 알림 수', () => {
  it('새 알림은 읽지 않음이고, 읽지 않은 수·중요 알림 수를 처리 상태와 상관없이 센다', async () => {
    const { list, unread, seedThree } = await fixture()
    expect(await unread()).toEqual({ unread: 0, unreadImportant: 0 })
    await seedThree()
    for (const alert of await list()) expect(alert.read).toBe(false)
    // 긴급·주의는 중요, 참고는 중요가 아니다
    expect(await unread()).toEqual({ unread: 3, unreadImportant: 2 })
  })

  it('필터: 읽지 않음 · 중요 · 둘을 함께', async () => {
    const { client, list, seedThree } = await fixture()
    const { urgent, notice, info } = await seedThree()
    await client.post(`/api/alerts/${notice.id}/read`)

    const ids = (alerts: AlertItem[]) => alerts.map((a) => a.id).sort()
    expect(ids(await list('?unread=true'))).toEqual(ids([urgent, info]))
    expect(ids(await list('?important=true'))).toEqual(ids([urgent, notice]))
    expect(ids(await list('?unread=true&important=true'))).toEqual(ids([urgent]))
    expect(await list('?unread=true&important=true&status=RESOLVED')).toEqual([])
    expect((await list()).length).toBe(3) // 전체
  })

  it('잘못된 필터 값은 400 이다', async () => {
    const { client } = await fixture()
    for (const query of ['unread=false', 'unread=yes', 'important=0']) {
      const res = await client.get(`/api/alerts?${query}`)
      expect(res.status, query).toBe(400)
      ApiErrorBodySchema.parse(await res.json())
    }
  })

  it('개별 읽음: 읽음만 바뀌고 알림의 처리 상태는 그대로다 (읽음 ≠ 해결)', async () => {
    const { ctx, client, list, unread, seedThree } = await fixture()
    const { urgent } = await seedThree()
    expect(urgent.status).toBe('OPEN')

    const res = await client.post(`/api/alerts/${urgent.id}/read`)
    expect(res.status).toBe(200)
    const { alert } = AlertResponseSchema.parse(await res.json())
    expect(alert.read).toBe(true)
    expect(alert).toMatchObject({
      status: 'OPEN', // 읽었다고 해서 확인·종료된 것이 아니다
      acknowledgedAt: null,
      resolvedAt: null,
      resolution: null,
      reminderCount: urgent.reminderCount,
    })
    expect(await unread()).toEqual({ unread: 2, unreadImportant: 1 })
    expect((await list()).find((a) => a.id === urgent.id)).toMatchObject({
      read: true,
      status: 'OPEN',
    })
    // 읽어도 서버의 처리 상태는 그대로라, 확인하지 않은 긴급 알림은 계속 "열림"이고 재알림 대상이다
    const row = await ctx.prisma.alert.findUniqueOrThrow({ where: { id: urgent.id } })
    expect(row).toMatchObject({ status: 'OPEN', acknowledgedAt: null, resolvedAt: null })
  })

  it('이미 읽은 알림을 다시 읽음 처리해도 같은 결과이고 개수는 변하지 않는다', async () => {
    const { client, unread, seedThree } = await fixture()
    const { notice } = await seedThree()
    const first = await client.post(`/api/alerts/${notice.id}/read`)
    const second = await client.post(`/api/alerts/${notice.id}/read`)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(AlertResponseSchema.parse(await second.json()).alert.read).toBe(true)
    expect(await unread()).toEqual({ unread: 2, unreadImportant: 1 })
  })

  it('모두 읽음: 읽지 않은 알림만 센 수를 돌려주고, 다시 해도 0이며, 처리 상태는 그대로다', async () => {
    const { client, list, unread, seedThree } = await fixture()
    const { notice } = await seedThree()
    await client.post(`/api/alerts/${notice.id}/read`) // 하나는 이미 읽음

    const res = await client.post('/api/alerts/read-all')
    expect(res.status).toBe(200)
    expect(AlertReadAllResponseSchema.parse(await res.json())).toEqual({ updated: 2 })
    expect(await unread()).toEqual({ unread: 0, unreadImportant: 0 })
    const after = await list()
    expect(after.every((a) => a.read)).toBe(true)
    // 모두 읽어도 진행 중인 알림은 진행 중이다
    expect(after.filter((a) => a.status === 'OPEN').length).toBeGreaterThan(0)
    expect(
      AlertReadAllResponseSchema.parse(await (await client.post('/api/alerts/read-all')).json()),
    ).toEqual({
      updated: 0,
    })
  })

  it('읽음 이후에 생긴 알림은 다시 읽지 않음이다', async () => {
    const { door, client, unread, seedThree } = await fixture()
    await seedThree()
    await client.post('/api/alerts/read-all')
    expect(await unread()).toEqual({ unread: 0, unreadImportant: 0 })
    // 반복 억제 시간이 지난 뒤의 현관 신호는 새 알림이 된다
    await door.device.motion(40 * MINUTE)
    expect(await unread()).toEqual({ unread: 1, unreadImportant: 1 })
  })

  it('읽음은 보호자마다 따로다', async () => {
    const { ctx, user, client, unread, seedThree, secondGuardian } = await fixture()
    const { urgent } = await seedThree()
    const second = await secondGuardian()

    await client.post(`/api/alerts/${urgent.id}/read`)
    expect(await unread()).toEqual({ unread: 2, unreadImportant: 1 })
    // 두 번째 보호자는 아직 아무것도 읽지 않았다
    expect(await ctx.services.alerts.unreadCount(user.householdId, second.id)).toEqual({
      unread: 3,
      unreadImportant: 2,
    })
    const item = (
      await ctx.services.alerts.list(user.householdId, second.id, {
        limit: 30,
        unread: 'true',
      })
    ).alerts.find((a) => a.id === urgent.id)
    expect(item?.read).toBe(false)
  })

  it('다른 가구의 알림은 읽을 수 없고(404), 개수에도 섞이지 않는다', async () => {
    const { ctx, client, unread, seedThree } = await fixture()
    const { urgent } = await seedThree()
    const other = await ctx.createHousehold()
    const otherClient = await ctx.loginAs(other)
    const res = await otherClient.post(`/api/alerts/${urgent.id}/read`)
    expect(res.status).toBe(404)
    expect(await unread(otherClient)).toEqual({ unread: 0, unreadImportant: 0 })
    expect(await unread()).toEqual({ unread: 3, unreadImportant: 2 })
    expect((await client.post('/api/alerts/nope/read')).status).toBe(404)
  })

  it('로그인하지 않으면 401 이다', async () => {
    const { ctx } = await fixture()
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/alerts/unread-count')).status).toBe(401)
    expect((await anonymous.post('/api/alerts/read-all')).status).toBe(401)
    expect((await anonymous.post('/api/alerts/x/read')).status).toBe(401)
  })

  it('상세에도 읽음 여부가 있고, 확인·종료해도 읽음은 따로 유지된다', async () => {
    const { client, seedThree } = await fixture()
    const { urgent } = await seedThree()
    const detail = async () =>
      AlertDetailSchema.parse(await (await client.get(`/api/alerts/${urgent.id}`)).json())
    expect((await detail()).alert.read).toBe(false)

    // 확인(acknowledge)해도 읽음이 되지 않는다 — 둘은 별개다
    const ack = AlertResponseSchema.parse(
      await (await client.post(`/api/alerts/${urgent.id}/acknowledge`)).json(),
    )
    expect(ack.alert).toMatchObject({ status: 'ACKNOWLEDGED', read: false })

    await client.post(`/api/alerts/${urgent.id}/read`)
    const resolved = AlertResponseSchema.parse(
      await (
        await client.post(`/api/alerts/${urgent.id}/resolve`, { resolution: 'CHECKED' })
      ).json(),
    )
    expect(resolved.alert).toMatchObject({ status: 'RESOLVED', read: true })
  })

  it('종료된 알림도 읽지 않았다면 읽지 않음으로 센다', async () => {
    const { client, unread, seedThree } = await fixture()
    const { urgent } = await seedThree()
    await client.post(`/api/alerts/${urgent.id}/resolve`, { resolution: 'FALSE_ALARM' })
    expect(await unread()).toEqual({ unread: 3, unreadImportant: 2 })
  })

  it('읽음 처리는 같은 보호자의 화면에만 alert.read 로 알리고, 바뀐 것이 없으면 알리지 않는다', async () => {
    const { client, listen, seedThree } = await fixture()
    const { urgent, notice } = await seedThree()
    const screen = await listen()

    await client.post(`/api/alerts/${urgent.id}/read`)
    await screen.waitForCount('alert.read', 1)
    expect(AlertReadPayloadSchema.parse(screen.of('alert.read')[0]?.payload)).toEqual({
      alertIds: [urgent.id],
      all: false,
    })

    await client.post(`/api/alerts/${urgent.id}/read`) // 이미 읽음: 알리지 않는다
    await client.post(`/api/alerts/${notice.id}/read`)
    await screen.waitForCount('alert.read', 2)
    expect(screen.of('alert.read')).toHaveLength(2)

    await client.post('/api/alerts/read-all')
    await screen.waitForCount('alert.read', 3)
    expect(AlertReadPayloadSchema.parse(screen.of('alert.read')[2]?.payload)).toEqual({
      alertIds: [],
      all: true,
    })
    await client.post('/api/alerts/read-all') // 더 읽을 것이 없음
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(screen.of('alert.read')).toHaveLength(3)
  })
})

describe('관련 움직임 기록과 전달 상태', () => {
  it('움직임 알림은 근거가 된 신호를 최신순으로, 센서 알림은 같은 때의 센서 상태 기록을 가리킨다', async () => {
    const { ctx, list, seedThree } = await fixture()
    const { notice, info } = await seedThree()
    const evidence = await ctx.prisma.alertEvidence.findMany({
      where: { alertId: notice.id },
      include: { event: true },
    })
    const newestFirst = evidence
      .map((e) => e.event)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .map((event) => `mov_${event.id}`)
    expect(notice.relatedEventIds).toEqual(newestFirst)
    expect(notice.relatedEventIds).toHaveLength(2)

    const log = await ctx.prisma.sensorStatusLog.findFirst({ where: { kind: 'BATTERY_LOW' } })
    expect(info.relatedEventIds).toEqual([`sta_${log!.id}`])
    expect((await list()).length).toBe(3)
  })

  it('전달 실패 알림처럼 가리킬 기록이 없으면 비어 있다', async () => {
    const { ctx, user, list } = await fixture()
    await ctx.prisma.alert.create({
      data: {
        householdId: user.householdId,
        type: 'DELIVERY_FAILED',
        severity: 'URGENT',
        origin: 'REAL',
        title: '알림을 전달하지 못했습니다',
        message: '테스트',
        triggeredAt: NIGHT,
        dedupeKey: 'DELIVERY_FAILED',
      },
    })
    const [alert] = await list()
    expect(alert?.relatedEventIds).toEqual([])
  })

  it('전달 상태: 대기 · 전송 시도 · 전송 성공 · 전달 확인 불가 · 전송 실패, 연동되지 않은 것은 상태가 없다', async () => {
    const { ctx, user, list } = await fixture()
    const guardian = await ctx.prisma.guardian.findFirstOrThrow({
      where: { householdId: user.householdId },
    })
    const cases: [
      string,
      {
        channel: 'IN_APP' | 'WEB_PUSH' | 'SMS'
        status: 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'CANCELLED'
        attempts: number
      }[],
      string | null,
    ][] = [
      ['대기', [{ channel: 'IN_APP', status: 'PENDING', attempts: 0 }], 'WAITING'],
      ['전송 시도', [{ channel: 'IN_APP', status: 'PENDING', attempts: 2 }], 'ATTEMPTING'],
      ['전송 성공', [{ channel: 'IN_APP', status: 'SENT', attempts: 1 }], 'SENT'],
      ['푸시는 확인 불가', [{ channel: 'WEB_PUSH', status: 'SENT', attempts: 1 }], 'UNVERIFIED'],
      ['전송 실패', [{ channel: 'IN_APP', status: 'FAILED', attempts: 3 }], 'FAILED'],
      ['연동 안 됨만', [{ channel: 'SMS', status: 'NOT_CONFIGURED', attempts: 0 }], null],
      ['중단만', [{ channel: 'IN_APP', status: 'CANCELLED', attempts: 0 }], null],
      [
        '화면 성공 + 푸시 확인 불가 → 성공이 우선',
        [
          { channel: 'IN_APP', status: 'SENT', attempts: 1 },
          { channel: 'WEB_PUSH', status: 'SENT', attempts: 1 },
        ],
        'SENT',
      ],
      [
        '푸시 확인 불가 + 화면 실패 → 확인 불가가 우선',
        [
          { channel: 'WEB_PUSH', status: 'SENT', attempts: 1 },
          { channel: 'IN_APP', status: 'FAILED', attempts: 3 },
        ],
        'UNVERIFIED',
      ],
      ['전달 대상 없음', [], null],
    ]
    let minute = 0
    const titles = new Map<string, string | null>()
    for (const [label, deliveries, expected] of cases) {
      minute += 1
      const alert = await ctx.prisma.alert.create({
        data: {
          householdId: user.householdId,
          type: 'REPEATED_MOVEMENT',
          severity: 'NOTICE',
          origin: 'REAL',
          title: label,
          message: '테스트',
          triggeredAt: new Date(NIGHT.getTime() + minute * MINUTE),
          dedupeKey: `d-${minute}`,
          deliveries: { create: deliveries.map((d) => ({ ...d, guardianId: guardian.id })) },
        },
      })
      titles.set(alert.id, expected)
    }
    const items = await list('?limit=50')
    for (const item of items) expect(item.deliveryState, item.title).toBe(titles.get(item.id))
  })
})

describe('센서 연결 복구 알림', () => {
  it('끊김이 기록된 센서가 돌아오면 "복구" 정보 알림이 만들어지고, 읽지 않음으로 올라온다', async () => {
    const { ctx, bed, list, unread } = await fixture()
    await bed.device.heartbeat() // 처음 연결: 복구가 아니다
    expect((await list()).filter((a) => a.type === 'SENSOR_RESTORED')).toHaveLength(0)

    ctx.clock.advance(6 * MINUTE)
    await ctx.services.maintenance.tick() // 끊김 기록 + 끊김 알림
    expect((await list()).filter((a) => a.type === 'SENSOR_OFFLINE')).toHaveLength(1)
    expect((await list()).filter((a) => a.type === 'SENSOR_RESTORED')).toHaveLength(0)

    await bed.device.heartbeat() // 복구
    const alerts = await list()
    const restored = alerts.find((a) => a.type === 'SENSOR_RESTORED')
    expect(restored).toMatchObject({
      severity: 'INFO',
      status: 'RESOLVED', // 알려 주기만 하면 되는 정보라 만들 때부터 종료 상태다
      resolution: 'AUTO_RESOLVED',
      read: false, // 종료되었어도 읽지는 않았다 — 읽음과 해결은 별개다
      sensorName: '침대 옆',
      deliveryState: null, // 정보 수준은 별도로 전달하지 않는다
    })
    expect(restored?.title).toBe("'침대 옆' 센서의 연결이 복구되었습니다")
    // 끊김 알림은 조건이 풀려 자동 종료된다
    expect(alerts.find((a) => a.type === 'SENSOR_OFFLINE')).toMatchObject({ status: 'RESOLVED' })
    const log = await ctx.prisma.sensorStatusLog.findFirst({
      where: { kind: 'CONNECTED', detail: '연결이 복구되었습니다.' },
    })
    expect(restored?.relatedEventIds).toEqual([`sta_${log!.id}`])
    expect((await unread()).unread).toBeGreaterThanOrEqual(1)
  })

  it('끊겼다 돌아올 때마다 새 복구 알림이 생긴다 (이전 복구 알림과 합치지 않는다)', async () => {
    const { ctx, bed, list } = await fixture()
    await bed.device.heartbeat()
    for (let i = 0; i < 2; i += 1) {
      ctx.clock.advance(6 * MINUTE)
      await ctx.services.maintenance.tick()
      await bed.device.heartbeat()
    }
    expect((await list('?limit=50')).filter((a) => a.type === 'SENSOR_RESTORED')).toHaveLength(2)
  })

  it('복구 알림은 소리·배너로 알리지 않는다 (alert.notify 없음), 화면 목록 갱신용 alert.created 만 간다', async () => {
    const { ctx, bed, listen } = await fixture()
    const screen = await listen()
    await bed.device.heartbeat()
    ctx.clock.advance(6 * MINUTE)
    await ctx.services.maintenance.tick()
    await bed.device.heartbeat()
    await screen.waitForCount('alert.created', 2) // 끊김 알림 + 복구 알림
    const created = screen
      .of('alert.created')
      .map((r) => (r.payload as { alert: { type: string } }).alert.type)
    expect(created).toContain('SENSOR_RESTORED')
    const notified = screen
      .of('alert.notify')
      .map((r) => (r.payload as { alert: { type: string } }).alert.type)
    expect(notified).toContain('SENSOR_OFFLINE')
    expect(notified).not.toContain('SENSOR_RESTORED')
  })
})
