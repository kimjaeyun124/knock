import { randomUUID } from 'node:crypto'
import { io as connect } from 'socket.io-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AlertListResponseSchema,
  AlertPayloadSchema,
  EventCreatedPayloadSchema,
  EventsResponseSchema,
  MonitoringStatusPayloadSchema,
  SensorStatusPayloadSchema,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { WEB_ORIGIN } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice, openSocket, type TestSocket } from '@/test-utils/scenario'

/**
 * 실시간 전달의 단계별 검증 (docs/REALTIME.md):
 *   수집 → 검증 → DB 저장 → 규칙 → 알림 → 가구별 Socket.IO 방 → 화면, 그리고 연결 종료 후 복구·중복 방지·보안.
 * Socket.IO 는 "화면을 빨리 갱신하는 알림"이고, DB 가 원본이다. 놓친 것은 REST 로 다시 읽어 복구한다.
 */
const contexts: TestContext[] = []
const sockets: TestSocket[] = []
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close())
  for (const ctx of contexts.splice(0)) await ctx.close()
})

async function fixture() {
  const ctx = await createTestContext()
  contexts.push(ctx)
  ctx.clock.set(NIGHT)
  const user = await ctx.createHousehold()
  const client = await ctx.loginAs(user)
  const stranger = await ctx.loginAs(await ctx.createHousehold())
  const make = async (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE', name: string) => {
    const sensor = await ctx.createSensor(user.householdId, { zone, name })
    return { id: sensor.id, token: sensor.token, device: new TestDevice(ctx, sensor.token) }
  }
  const listen = async (who = client) => {
    const s = await openSocket(ctx.baseUrl, who)
    sockets.push(s)
    return s
  }
  const send = (token: string, eventId: string, occurredAt?: Date) =>
    fetch(`${ctx.baseUrl}/api/ingest/v1/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            eventId,
            type: 'MOTION',
            ...(occurredAt ? { occurredAt: occurredAt.toISOString() } : {}),
          },
        ],
      }),
    })
  const restEvents = async () =>
    EventsResponseSchema.parse(await (await client.get('/api/events?limit=100')).json()).events
  const restAlerts = async () =>
    AlertListResponseSchema.parse(await (await client.get('/api/alerts?limit=100')).json()).alerts
  return { ctx, user, client, stranger, make, listen, send, restEvents, restAlerts }
}

describe('1~4. 시뮬레이션 이벤트 → 저장 → 전송 → 화면에 닿는 데이터', () => {
  it('신호를 받으면 DB 에 저장되고, 같은 가구의 화면이 event.created·alert.created 를 받는다 (payload 는 공통 스키마와 일치)', async () => {
    const { make, listen, restEvents, restAlerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const screen = await listen()

    await door.device.motion()
    await screen.waitForCount('event.created', 1)
    await screen.waitForCount('alert.created', 1)

    const created = EventCreatedPayloadSchema.parse(screen.of('event.created')[0]?.payload)
    const alert = AlertPayloadSchema.parse(screen.of('alert.created')[0]?.payload).alert
    // 소켓으로 받은 것과 DB(REST)의 내용이 같다 — DB 가 원본이다.
    expect((await restEvents()).map((e) => e.id)).toEqual([created.event.id])
    expect((await restAlerts()).map((a) => a.id)).toEqual([alert.id])
    expect(alert).toMatchObject({ type: 'ENTRANCE_APPROACH', severity: 'URGENT' })
  })

  it('저장이 끝난 뒤에 알린다: 화면이 event.created 를 받는 순간 REST 로 같은 기록이 읽힌다', async () => {
    const { make, listen, restEvents } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const screen = await listen()
    let seenInDb = false
    screen.socket.on('event.created', () => {
      void restEvents().then((events) => {
        seenInDb = events.length === 1
      })
    })
    await door.device.motion()
    await screen.waitForCount('event.created', 1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(seenInDb).toBe(true)
  })

  it('센서 연결·모니터링 상태 변화는 sensor.status·monitoring.status 로 전달된다', async () => {
    const { make, listen, ctx } = await fixture()
    const bed = await make('BED_SIDE', '침대 옆')
    const screen = await listen()

    await bed.device.heartbeat({ batteryPercent: 80 }) // 첫 연결
    await screen.waitForCount('sensor.status', 1)
    expect(SensorStatusPayloadSchema.parse(screen.of('sensor.status')[0]?.payload).change).toBe(
      'CONNECTED',
    )
    await screen.waitForCount('monitoring.status', 1)
    const first = MonitoringStatusPayloadSchema.parse(
      screen.of('monitoring.status').at(-1)?.payload,
    ).monitoring
    expect(first).toMatchObject({
      enabled: true,
      activeSensors: 1,
      connectedSensors: 1,
      monitoredNow: true,
    })

    // 신호가 끊긴 것을 점검이 찾으면 연결된 센서 수가 줄어든다.
    ctx.clock.advance(10 * MINUTE)
    await ctx.services.pipeline.checkSensorConnections()
    await vi.waitFor(
      () =>
        expect(
          MonitoringStatusPayloadSchema.parse(screen.of('monitoring.status').at(-1)?.payload)
            .monitoring.connectedSensors,
        ).toBe(0),
      { timeout: 3000 },
    )
  })

  it('설정을 저장하면 monitoring.status 로 모니터링 사용 여부가 전달된다', async () => {
    const { client, listen } = await fixture()
    const screen = await listen()
    const res = await client.request('/api/v1/settings', {
      method: 'PATCH',
      body: { detection: { monitoringEnabled: false } },
    })
    expect(res.status).toBe(200)
    await screen.waitForCount('monitoring.status', 1)
    expect(
      MonitoringStatusPayloadSchema.parse(screen.of('monitoring.status')[0]?.payload).monitoring
        .enabled,
    ).toBe(false)
  })
})

describe('보안: 가구별 방 · 임의 참여/발행 금지', () => {
  it('다른 가구의 화면은 이 가구의 이벤트·알림·상태를 받지 못한다', async () => {
    const { make, listen, stranger } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const mine = await listen()
    const theirs = await listen(stranger)
    await door.device.motion()
    await mine.waitForCount('alert.created', 1)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(theirs.received.filter((r) => r.event !== 'server:ready')).toEqual([])
  })

  it('클라이언트가 보낸 이벤트는 서버가 처리하지 않는다: 위조한 알림을 발행해도 다른 화면에 전달되지 않는다', async () => {
    const { listen } = await fixture()
    const victim = await listen()
    const attacker = await listen()
    // 서버는 클라이언트→서버 이벤트를 하나도 받지 않는다. 어떤 이름으로 보내도 아무 일도 일어나지 않는다.
    for (const name of [
      'alert.created',
      'event.created',
      'monitoring.status',
      'join',
      'join-room',
      'subscribe',
    ]) {
      attacker.socket.emit(name, { alert: { id: 'forged' }, room: 'household:other' })
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(victim.received.filter((r) => r.event !== 'server:ready')).toEqual([])
    expect(attacker.socket.connected).toBe(true)
  })

  it('방에 마음대로 들어갈 수 없다: 다른 가구의 방 이름을 보내도 그 방의 이벤트를 받지 못한다', async () => {
    const { ctx, user, make, stranger, listen } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const attacker = await listen(stranger)
    attacker.socket.emit('join', `household:${user.householdId}`)
    attacker.socket.emit('join', { room: `household:${user.householdId}` })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const members = await ctx.io.in(`household:${user.householdId}`).fetchSockets()
    expect(members).toHaveLength(0)
    await door.device.motion()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(attacker.received.filter((r) => r.event !== 'server:ready')).toEqual([])
  })

  it('로그인하지 않은 연결과 로그아웃한 세션의 연결은 받지 못한다', async () => {
    const { ctx, client } = await fixture()
    const anonymous = connect(ctx.baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: WEB_ORIGIN },
    })
    const error = await new Promise<Error>((resolve) => anonymous.once('connect_error', resolve))
    expect(error.message).toBe('UNAUTHORIZED')
    anonymous.close()

    const screen = await openSocket(ctx.baseUrl, client)
    sockets.push(screen)
    const closed = new Promise<string>((resolve) => screen.socket.once('disconnect', resolve))
    await client.post('/api/auth/logout')
    expect(await closed).toBe('io server disconnect')
  })

  it('수집 API 는 센서 토큰이 없거나 틀리면 거부하므로 위조 신호가 DB·화면에 닿지 않는다', async () => {
    const { ctx, listen, restEvents } = await fixture()
    const screen = await listen()
    const res = await fetch(`${ctx.baseUrl}/api/ingest/v1/events`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tsn_forged', 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ eventId: randomUUID(), type: 'MOTION' }] }),
    })
    expect(res.status).toBe(401)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await restEvents()).toEqual([])
    expect(screen.received.filter((r) => r.event !== 'server:ready')).toEqual([])
  })
})

describe('5~6. 연결 종료 후 복구와 누락 데이터 재조회', () => {
  it('연결이 끊긴 동안의 이벤트는 소켓으로 오지 않지만 DB 에 남고, 다시 연결한 화면은 REST 로 모두 읽는다', async () => {
    const { make, listen, restEvents, restAlerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const bed = await make('BED_SIDE', '침대 옆')

    const first = await listen()
    await door.device.motion()
    await first.waitForCount('event.created', 1)
    first.close() // 화면이 끊김

    await bed.device.motion(MINUTE)
    await door.device.motion(30 * MINUTE) // 끊긴 동안 더 생긴 신호

    // 소켓 메시지는 쌓이지 않는다(보장하지 않음). 그러나 DB 에는 모두 있다.
    const second = await listen()
    expect(second.of('event.created')).toHaveLength(0)
    expect(await restEvents()).toHaveLength(3)
    expect((await restAlerts()).length).toBeGreaterThanOrEqual(2)

    // 다시 연결한 뒤의 새 이벤트는 다시 실시간으로 온다.
    await bed.device.motion(31 * MINUTE)
    await second.waitForCount('event.created', 1)
    expect(await restEvents()).toHaveLength(4)
  })

  it('끊김·복구는 상태 이력으로 남아, 다시 읽으면 놓친 연결 변화도 알 수 있다', async () => {
    const { ctx, make, listen, client } = await fixture()
    const bed = await make('BED_SIDE', '침대 옆')
    await bed.device.heartbeat()
    const screen = await listen()
    screen.close()
    ctx.clock.advance(10 * MINUTE)
    await ctx.services.pipeline.checkSensorConnections()
    const sensors = (await (await client.get('/api/sensors')).json()) as {
      sensors: { state: string }[]
    }
    expect(sensors.sensors[0]?.state).toBe('OFFLINE')
  })
})

describe('7. 중복 이벤트 방지', () => {
  it('같은 eventId 를 여러 번(동시에도) 보내도 저장·소켓 전달·알림이 한 번뿐이다', async () => {
    const { make, listen, send, restEvents, restAlerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const screen = await listen()
    const id = randomUUID()
    const responses = await Promise.all([1, 2, 3, 4, 5].map(() => send(door.token, id)))
    expect(responses.every((r) => r.status === 200)).toBe(true)

    await screen.waitForCount('event.created', 1)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(screen.of('event.created')).toHaveLength(1)
    expect(screen.of('alert.created')).toHaveLength(1)
    expect(await restEvents()).toHaveLength(1)
    const alerts = await restAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.occurrences).toBe(1)
  })

  it('중복 전송은 알림 횟수에 세지 않고, 서로 다른 이벤트는 합쳐서 센다', async () => {
    const { make, send, restAlerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const a = randomUUID()
    await send(door.token, a)
    await send(door.token, a)
    await send(door.token, randomUUID())
    const [alert] = await restAlerts()
    expect(alert?.occurrences).toBe(2)
  })
})
