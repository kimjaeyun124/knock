import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AlertListResponseSchema,
  ApiErrorBodySchema,
  FeaturesResponseSchema,
  SCENARIOS,
  SimulatorStateSchema,
  type SimulatorState,
} from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice, openSocket } from '@/test-utils/scenario'

const BASE = '/api/dev/simulator'

describe('시뮬레이터 API', () => {
  let ctx: TestContext
  let user: TestHousehold
  let client: TestClient
  // 시나리오의 기다리는 시간만큼 테스트 시계를 앞당겨, 실제 시간 흐름과 같은 효과를 낸다.
  let breakIngestOnLongWait = false
  const advance = (ms: number) => {
    ctx.clock.advance(ms)
    // 장애 시험: 긴 기다림 뒤(두 번째 단계 직전)에 수집 API 에 닿지 못하게 한다.
    if (breakIngestOnLongWait && ms >= MINUTE) sim().setIngestBaseUrl('http://127.0.0.1:9')
    return Promise.resolve()
  }

  beforeAll(async () => {
    ctx = await createTestContext({ simulator: { sleep: advance } })
    user = await ctx.createHousehold()
    client = await ctx.loginAs(user)
  })
  afterAll(async () => {
    ctx.services.simulator?.stop()
    await ctx.close()
  })

  const state = async (): Promise<SimulatorState> =>
    SimulatorStateSchema.parse(await (await client.get(`${BASE}/state`)).json())
  const alerts = async () =>
    AlertListResponseSchema.parse(await (await client.get('/api/alerts?limit=100')).json()).alerts
  const sim = () => ctx.services.simulator!
  async function reset() {
    await client.delete('/api/data/simulated')
    await ctx.prisma.alert.deleteMany({ where: { householdId: user.householdId } })
    await ctx.prisma.detectionSettings.deleteMany({ where: { householdId: user.householdId } })
    ctx.clock.set(NIGHT)
  }
  async function playScenario(id: string, speed = 1) {
    const res = await client.post(`${BASE}/scenarios/${id}/run`, { speed })
    expect(res.status).toBe(200)
    await sim().idle(user.householdId)
  }

  describe('접근 제어', () => {
    it('로그인하지 않으면 401, 허용되지 않은 출처는 403 이다', async () => {
      const anonymous = new TestClient(ctx.baseUrl)
      expect((await anonymous.get(`${BASE}/state`)).status).toBe(401)
      expect((await anonymous.post(`${BASE}/motion`, { zone: 'PATH' })).status).toBe(401)
      const res = await client.post(
        `${BASE}/motion`,
        { zone: 'PATH' },
        { Origin: 'https://evil.example' },
      )
      expect(res.status).toBe(403)
    })

    it('SIMULATOR_ENABLED 가 꺼져 있으면 경로 자체가 없다', async () => {
      const off = await createTestContext()
      try {
        const c = await off.loginAs(await off.createHousehold())
        const res = await c.get(`${BASE}/state`)
        expect(res.status).toBe(404)
        expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('NOT_FOUND')
        expect(
          FeaturesResponseSchema.parse(await (await c.get('/api/system/features')).json()),
        ).toEqual({ simulatorEnabled: false })
        expect(off.services.simulator).toBeNull()
      } finally {
        await off.close()
      }
    })

    it('켜져 있으면 기능 목록에 알린다', async () => {
      expect(
        FeaturesResponseSchema.parse(await (await client.get('/api/system/features')).json()),
      ).toEqual({ simulatorEnabled: true })
    })
  })

  describe('센서와 신호', () => {
    beforeAll(reset)

    it('처음에는 센서가 없고, 야간 시간대 여부를 알려 준다', async () => {
      const s = await state()
      expect(s.sensors.map((x) => x.sensor)).toEqual([null, null, null])
      expect(s.night.isNightNow).toBe(true)
      expect(s.running).toBeNull()
    })

    it('센서를 만들면 세 구역의 SIMULATED 센서가 생기고 연결된 상태가 되며, 토큰은 응답에 없다', async () => {
      const res = await client.post(`${BASE}/sensors`)
      const text = await res.text()
      expect(res.status).toBe(200)
      expect(text).not.toContain('tsn_')
      const s = SimulatorStateSchema.parse(JSON.parse(text))
      expect(s.sensors.map((x) => x.sensor?.origin)).toEqual([
        'SIMULATED',
        'SIMULATED',
        'SIMULATED',
      ])
      expect(s.sensors.map((x) => x.sensor?.state)).toEqual(['ONLINE', 'ONLINE', 'ONLINE'])
      expect(s.sensors.map((x) => x.sensor?.batteryPercent)).toEqual([90, 90, 90])
    })

    it('다시 만들어도 센서가 늘어나지 않는다 (멱등)', async () => {
      await client.post(`${BASE}/sensors`)
      expect(await ctx.prisma.sensor.count({ where: { householdId: user.householdId } })).toBe(3)
    })

    it('움직임은 실제 센서와 같은 수집 API 를 거쳐 SIMULATED 이벤트로 저장된다', async () => {
      await client.post(`${BASE}/motion`, { zone: 'PATH' })
      const events = await ctx.prisma.movementEvent.findMany({
        where: { householdId: user.householdId },
      })
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ origin: 'SIMULATED', zone: 'PATH' })
      // 수집 API 의 처리 기록(마지막 신호 시각)이 남아 있다 = 지름길이 아님
      const sensor = await ctx.prisma.sensor.findFirstOrThrow({
        where: { householdId: user.householdId, zone: 'PATH' },
      })
      expect(sensor.lastSeenAt).not.toBeNull()
    })

    it('수집 API 가 거부하면(센서를 사용 안 함으로 바꿈) 성공처럼 넘기지 않고 이유를 알린다', async () => {
      const sensor = await ctx.prisma.sensor.findFirstOrThrow({
        where: { householdId: user.householdId, zone: 'ENTRANCE' },
      })
      await ctx.prisma.sensor.update({ where: { id: sensor.id }, data: { isActive: false } })
      const res = await client.post(`${BASE}/motion`, { zone: 'ENTRANCE' })
      expect(res.status).toBe(409)
      expect(ApiErrorBodySchema.parse(await res.json()).error.message).toContain('수집 API')
      await ctx.prisma.sensor.update({ where: { id: sensor.id }, data: { isActive: true } })
    })

    it('토큰이 재발급되어 무효해져도 한 번 새로 받아 이어서 보낸다', async () => {
      const sensor = await ctx.prisma.sensor.findFirstOrThrow({
        where: { householdId: user.householdId, zone: 'BED_SIDE' },
      })
      await client.post(`/api/sensors/${sensor.id}/rotate-token`)
      expect((await client.post(`${BASE}/motion`, { zone: 'BED_SIDE' })).status).toBe(200)
    })

    it('잘못된 요청은 400 이다', async () => {
      expect((await client.post(`${BASE}/motion`, { zone: 'KITCHEN' })).status).toBe(400)
      expect(
        (await client.post(`${BASE}/battery`, { zone: 'PATH', batteryPercent: 101 })).status,
      ).toBe(400)
      expect((await client.post(`${BASE}/scenarios/entrance/run`, { speed: 5 })).status).toBe(400)
    })

    it('없는 시나리오는 404 이다', async () => {
      expect((await client.post(`${BASE}/scenarios/none/run`, {})).status).toBe(404)
    })
  })

  describe('실제 데이터와 섞이지 않는다', () => {
    beforeAll(reset)

    it('시뮬레이션 신호의 알림은 SIMULATED, 실제 센서의 알림은 REAL 이고 서로 판단에 섞이지 않는다', async () => {
      const real = new TestDevice(
        ctx,
        (await ctx.createSensor(user.householdId, { zone: 'BED_SIDE' })).token,
      )
      await real.motion() // 실제: 침대 옆
      await client.post(`${BASE}/motion`, { zone: 'PATH' }) // 시뮬레이션: 이동 경로
      const list = await alerts()
      // 실제 침대 옆 → 시뮬레이션 이동 경로는 하나의 흐름으로 보지 않는다
      expect(list.filter((a) => a.type === 'BED_TO_PATH')).toHaveLength(0)

      await client.post(`${BASE}/motion`, { zone: 'ENTRANCE' })
      const after = await alerts()
      expect(
        after.filter((a) => a.type === 'ENTRANCE_APPROACH').every((a) => a.origin === 'SIMULATED'),
      ).toBe(true)
    })
  })

  describe('시나리오 (기본 민감도 보통, 야간)', () => {
    const types = async () =>
      (await alerts()).map((a) => `${a.type}:${a.severity}:${a.origin}`).sort()

    it('1. 화장실에 다녀온 뒤 침대로 돌아옴: 확인 필요 1건, 긴급 없음', async () => {
      await reset()
      await playScenario('normal-night')
      expect(await types()).toEqual(['BED_TO_PATH:NOTICE:SIMULATED'])
    })

    it('1. 같은 시나리오도 민감도 낮음에서는 알림이 없다', async () => {
      await reset()
      await ctx.services.settings.update(user.householdId, {
        ...(await ctx.services.settings.getRules(user.householdId)),
        sensitivity: 'LOW',
      })
      await playScenario('normal-night')
      expect(await types()).toEqual([])
      expect(
        await ctx.prisma.movementEvent.count({
          where: { householdId: user.householdId, origin: 'SIMULATED' },
        }),
      ).toBe(4)
    })

    it('2. 침대 주변에서 이동 경로로 이어진 움직임', async () => {
      await reset()
      await playScenario('bed-to-path')
      expect(await types()).toEqual(['BED_TO_PATH:NOTICE:SIMULATED'])
    })

    it('3. 현관 근처 움직임: 즉시 확인 권장', async () => {
      await reset()
      await playScenario('entrance')
      expect(await types()).toEqual(['ENTRANCE_APPROACH:URGENT:SIMULATED'])
    })

    it('4. 짧은 시간 동안 여러 구역의 움직임', async () => {
      await reset()
      await playScenario('repeated-movement')
      const list = await types()
      expect(list).toContain('REPEATED_MOVEMENT:NOTICE:SIMULATED')
      expect(list).toContain('ENTRANCE_APPROACH:URGENT:SIMULATED')
    })

    it('5. 배터리 소진과 연결 끊김: 배터리 알림 뒤, 설정한 시간이 지나면 연결 끊김', async () => {
      await reset()
      await playScenario('sensor-trouble')
      const afterScenario = await alerts()
      const battery = afterScenario.filter((a) => a.type === 'LOW_BATTERY')
      expect(battery).toHaveLength(1)
      expect(battery[0]?.severity).toBe('NOTICE') // 18% 참고 → 9% 확인 필요로 격상
      const s = await state()
      expect(s.sensors[0]?.silenced).toBe(true)
      expect(s.sensors[0]?.batteryPercent).toBe(9)

      // 멈춘 센서는 주기 heartbeat 도 보내지 않는다. 5분이 지나면 끊김으로 본다.
      await advance(6 * MINUTE)
      await sim().tickHeartbeats()
      await ctx.services.maintenance.tick()
      const offline = (await alerts()).filter(
        (a) => a.type === 'SENSOR_OFFLINE' && a.origin === 'SIMULATED',
      )
      expect(offline).toHaveLength(1)
      expect(offline[0]?.origin).toBe('SIMULATED')
      const after = await state()
      expect(after.sensors[0]?.sensor?.state).toBe('OFFLINE')
      expect(after.sensors[1]?.sensor?.state).toBe('ONLINE') // 멈추지 않은 센서는 계속 연결됨

      // 복구하면 바로 신호를 보내 연결된 상태로 돌아오고 끊김 알림은 자동 종료된다
      await client.post(`${BASE}/silence`, { zone: 'BED_SIDE', silenced: false })
      await ctx.services.maintenance.tick()
      expect((await state()).sensors[0]?.sensor?.state).toBe('ONLINE')
      const resolved = (await alerts()).find(
        (a) => a.type === 'SENSOR_OFFLINE' && a.origin === 'SIMULATED',
      )
      expect(resolved).toMatchObject({ status: 'RESOLVED', resolution: 'AUTO_RESOLVED' })
    })

    it('여섯 시나리오가 모두 재생된다 (알려진 시나리오 목록과 일치)', () => {
      expect(SCENARIOS.map((s) => s.id)).toEqual([
        'normal-night',
        'bed-to-path',
        'entrance',
        'repeated-movement',
        'sensor-trouble',
        'delivery-failure',
      ])
    })
  })

  describe('주간에는 기록만 남는다', () => {
    it('야간 시간대 밖에서는 상태가 그 사실을 알리고, 움직임 알림은 만들어지지 않는다', async () => {
      await reset()
      ctx.clock.set(new Date('2026-11-15T04:00:00Z')) // 한국 시각 13:00
      expect((await state()).night.isNightNow).toBe(false)
      await playScenario('entrance')
      expect(await alerts()).toEqual([])
      expect(
        await ctx.prisma.movementEvent.count({
          where: { householdId: user.householdId, origin: 'SIMULATED' },
        }),
      ).toBe(1)
    })
  })

  describe('장애 주입: 알림 전달 실패', () => {
    it('시뮬레이션 알림의 앱 화면 전달만 실패시키고, 실제 알림은 정상 전달한다', async () => {
      await reset()
      const screen = await openSocket(ctx.baseUrl, client)
      try {
        const real = new TestDevice(
          ctx,
          (await ctx.createSensor(user.householdId, { zone: 'ENTRANCE' })).token,
        )

        await client.post(`${BASE}/faults`, { deliveryFailure: true })
        expect((await state()).deliveryFailure.enabled).toBe(true)

        await real.motion() // 실제 현관 신호
        await client.post(`${BASE}/motion`, { zone: 'ENTRANCE' }) // 시뮬레이션 현관 신호

        const list = await alerts()
        const realAlert = list.find((a) => a.origin === 'REAL')!
        const simAlert = list.find((a) => a.origin === 'SIMULATED')!
        expect(realAlert.delivery.sent).toBe(1) // 실제 알림은 영향 없음
        expect(simAlert.delivery.sent).toBe(0)
        expect(simAlert.delivery.pending + simAlert.delivery.failed).toBeGreaterThan(0)
        expect(screen.of('alert.notify')).toHaveLength(1) // 화면에는 실제 알림만 도착
      } finally {
        screen.close()
      }
    })

    it('재시도가 모두 실패하면 "전달 실패" 알림이 시뮬레이션 알림으로 생긴다', async () => {
      await reset()
      const screen = await openSocket(ctx.baseUrl, client)
      try {
        await playScenario('delivery-failure')
        await advance(31_000)
        await ctx.services.maintenance.tick()
        await advance(2 * MINUTE + 1000)
        await ctx.services.maintenance.tick()
        const failed = (await alerts()).filter((a) => a.type === 'DELIVERY_FAILED')
        expect(failed).toHaveLength(1)
        expect(failed[0]?.origin).toBe('SIMULATED')
        expect(
          screen
            .of('alert.notify')
            .every(
              (m) =>
                (m.payload as { alert: { origin: string } }).alert.origin !== 'SIMULATED' || false,
            ),
        ).toBe(true)
      } finally {
        screen.close()
      }
    })

    it('주입을 끄면 다시 정상 전달되고, 켜 둔 채 잊어도 10분 뒤 저절로 꺼진다', async () => {
      await reset()
      await client.post(`${BASE}/faults`, { deliveryFailure: true })
      expect((await state()).deliveryFailure.expiresAt).not.toBeNull()
      await advance(11 * MINUTE)
      expect((await state()).deliveryFailure).toEqual({ enabled: false, expiresAt: null })

      const screen = await openSocket(ctx.baseUrl, client)
      try {
        await client.post(`${BASE}/faults`, { deliveryFailure: true })
        await client.post(`${BASE}/faults`, { deliveryFailure: false })
        await client.post(`${BASE}/motion`, { zone: 'ENTRANCE' })
        expect((await alerts())[0]?.delivery.sent).toBe(1)
      } finally {
        screen.close()
      }
    })
  })

  describe('재생 제어', () => {
    it('재생 중에는 다시 재생할 수 없고(409), 멈추면 멈춘 기록이 남는다', async () => {
      const hold = await createTestContext({
        simulator: {
          sleep: (_ms, signal) =>
            new Promise((resolve) => signal.addEventListener('abort', () => resolve())),
        },
      })
      try {
        const c = await hold.loginAs(await hold.createHousehold())
        hold.clock.set(NIGHT)
        expect((await c.post(`${BASE}/scenarios/bed-to-path/run`, { speed: 10 })).status).toBe(200)
        const running = SimulatorStateSchema.parse(await (await c.get(`${BASE}/state`)).json())
        expect(running.running).toMatchObject({
          scenarioId: 'bed-to-path',
          speed: 10,
          totalSteps: 2,
        })
        expect((await c.post(`${BASE}/scenarios/entrance/run`, {})).status).toBe(409)

        const stopped = SimulatorStateSchema.parse(
          await (await c.post(`${BASE}/scenarios/stop`)).json(),
        )
        expect(stopped.running).toBeNull()
        expect(stopped.lastRun).toMatchObject({ scenarioId: 'bed-to-path', outcome: 'STOPPED' })
      } finally {
        hold.services.simulator?.stop()
        await hold.close()
      }
    })

    it('시작할 때 수집 API 에 닿지 못하면 재생하지 않고 바로 오류로 알린다', async () => {
      await reset()
      await sim().ensureSensors(user.householdId)
      sim().setIngestBaseUrl('http://127.0.0.1:9') // 닿지 않는 주소
      try {
        const res = await client.post(`${BASE}/scenarios/entrance/run`, {})
        expect(res.status).toBe(503)
        expect((await state()).running).toBeNull()
      } finally {
        sim().setIngestBaseUrl(ctx.baseUrl)
      }
    })

    it('재생 도중 단계가 실패하면 FAILED 와 이유를 남긴다 (조용히 끝나지 않는다)', async () => {
      await reset()
      breakIngestOnLongWait = true
      try {
        await client.post(`${BASE}/scenarios/bed-to-path/run`, {})
        await sim().idle(user.householdId)
      } finally {
        breakIngestOnLongWait = false
        sim().setIngestBaseUrl(ctx.baseUrl)
      }
      const s = await state()
      expect(s.lastRun?.outcome).toBe('FAILED')
      expect(s.lastRun?.error).toContain('수집 API')
      expect(s.running).toBeNull()
    })
  })
})
