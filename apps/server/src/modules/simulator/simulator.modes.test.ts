import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AlertListResponseSchema, SimulatorStateSchema } from '@tetris/shared'
import type { SimulatorState } from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import type { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT } from '@/test-utils/scenario'

/** 한국 시각 2026-11-15 13:00 (낮) */
const DAY = new Date('2026-11-15T04:00:00Z')
const BASE = '/api/dev/simulator'

/**
 * 시뮬레이터의 전송 방식(중복·반복·야간)·센서 생성/해제·끊김 단축·전송 기록.
 * 모든 신호는 실제 수집 API(HTTP, 장치 토큰)를 거치므로, 아래 결과는 실제 센서와 같은 서버 처리 경로의 결과다.
 */
describe('시뮬레이터 전송 방식과 기록', () => {
  let ctx: TestContext
  let user: TestHousehold
  let client: TestClient

  beforeAll(async () => {
    ctx = await createTestContext({ simulator: {} })
    user = await ctx.createHousehold()
    client = await ctx.loginAs(user)
  })
  afterAll(async () => {
    ctx.services.simulator?.stop()
    await ctx.close()
  })
  beforeEach(async () => {
    await client.delete('/api/data/simulated')
    await ctx.prisma.alert.deleteMany({ where: { householdId: user.householdId } })
    await ctx.prisma.detectionSettings.deleteMany({ where: { householdId: user.householdId } })
    ctx.clock.set(NIGHT)
  })

  const parse = async (res: Response): Promise<SimulatorState> =>
    SimulatorStateSchema.parse(await res.json())
  const post = (path: string, body?: unknown) => client.post(`${BASE}${path}`, body ?? {})
  const motion = async (body: Record<string, unknown>) => parse(await post('/motion', body))
  const alertTypes = async (): Promise<string[]> =>
    AlertListResponseSchema.parse(
      await (await client.get('/api/alerts?limit=100')).json(),
    ).alerts.map((a) => a.type)
  const eventCount = () =>
    ctx.prisma.movementEvent.count({ where: { householdId: user.householdId } })

  describe('센서 만들기(연결)와 해제', () => {
    it('구역을 주면 그 구역의 시뮬레이션 센서만 만든다', async () => {
      const state = await parse(await post('/sensors', { zone: 'PATH' }))
      expect(state.sensors.map((s) => s.sensor !== null)).toEqual([false, true, false])
      expect(
        (await ctx.prisma.sensor.findMany({ where: { householdId: user.householdId } })).map(
          (s) => s.origin,
        ),
      ).toEqual(['SIMULATED'])
    })

    it('구역 없이 보내면 세 구역 모두 만든다 (기존 동작)', async () => {
      const state = await parse(await post('/sensors'))
      expect(state.sensors.every((s) => s.sensor !== null)).toBe(true)
    })

    it('연결 해제하면 그 시뮬레이션 센서와 기록이 지워지고, 실제 센서는 그대로다', async () => {
      const real = await ctx.createSensor(user.householdId, { zone: 'PATH', name: '실제 복도' })
      await post('/sensors', { zone: 'PATH' })
      await motion({ zone: 'PATH' })
      expect(await eventCount()).toBe(1)

      const res = await client.delete(`${BASE}/sensors/PATH`)
      expect(res.status).toBe(200)
      expect((await parse(res)).sensors[1]?.sensor).toBeNull()
      expect(await eventCount()).toBe(0)
      const left = await ctx.prisma.sensor.findMany({ where: { householdId: user.householdId } })
      expect(left.map((s) => s.id)).toEqual([real.id])
    })

    it('센서가 없으면 404, 알 수 없는 구역이면 400 이다', async () => {
      expect((await client.delete(`${BASE}/sensors/PATH`)).status).toBe(404)
      expect((await client.delete(`${BASE}/sensors/ROOF`)).status).toBe(400)
      expect((await post('/sensors', { zone: 'ROOF' })).status).toBe(400)
    })

    it('해제한 센서를 다시 만들 수 있다 (새 센서)', async () => {
      await post('/sensors', { zone: 'ENTRANCE' })
      await client.delete(`${BASE}/sensors/ENTRANCE`)
      const state = await parse(await post('/sensors', { zone: 'ENTRANCE' }))
      expect(state.sensors[2]?.sensor?.origin).toBe('SIMULATED')
    })
  })

  describe('중복·반복(한 번에 여러 건) 전송', () => {
    it('같은 이벤트를 두 번 보내면 첫 번째만 저장되고 두 번째는 중복으로 표시된다', async () => {
      const state = await motion({ zone: 'PATH', mode: 'duplicate' })
      expect(state.recent[0]).toMatchObject({ ok: true, zone: 'PATH' })
      expect(state.recent[0]?.requests.map((r) => r.status)).toEqual(['ACCEPTED', 'DUPLICATE'])
      expect(new Set(state.recent[0]?.requests.map((r) => r.eventId)).size).toBe(1)
      expect(await eventCount()).toBe(1)
    })

    it('여러 건을 한 번에 보내면 건수만큼 저장되고 건마다 결과가 나온다', async () => {
      const state = await motion({ zone: 'PATH', mode: 'burst', count: 5 })
      expect(state.recent[0]?.requests).toHaveLength(5)
      expect(state.recent[0]?.requests.every((r) => r.status === 'ACCEPTED')).toBe(true)
      expect(await eventCount()).toBe(5)
    })

    it.each([
      ['건수가 1', { mode: 'burst', count: 1 }],
      ['건수가 너무 많음', { mode: 'burst', count: 21 }],
      ['알 수 없는 방식', { mode: 'flood' }],
      ['알 수 없는 발생 시각', { when: 'tomorrow' }],
    ])('잘못된 전송 요청은 400: %s', async (_name, extra) => {
      expect((await post('/motion', { zone: 'PATH', ...extra })).status).toBe(400)
    })

    it('잘못된 신호를 보내면 서버가 거부하고 저장하지 않으며, 센서의 수신 오류로 기록된다 (요청은 실패가 아니라 "거부됨"으로 표시)', async () => {
      await post('/sensors', { zone: 'PATH' })
      const state = await motion({ zone: 'PATH', mode: 'invalid' })
      expect(state.recent[0]?.requests.map((r) => [r.status, r.reason])).toEqual([
        ['REJECTED', 'TOO_OLD'],
      ])
      expect(state.recent[0]?.ok).toBe(false)
      expect(await eventCount()).toBe(0)
      expect(state.sensors[1]?.sensor?.receiveErrors).toMatchObject({
        count: 1,
        lastReason: 'TOO_OLD',
      })
    })

    it('시뮬레이션 신호는 시뮬레이션으로 저장된다 (실제 기록과 구별)', async () => {
      await motion({ zone: 'PATH' })
      const rows = await ctx.prisma.movementEvent.findMany({
        where: { householdId: user.householdId },
      })
      expect(rows.map((r) => r.origin)).toEqual(['SIMULATED'])
    })
  })

  describe('야간 이벤트 테스트', () => {
    it('낮에도 가장 최근 야간으로 보내면 야간 규칙이 적용되어 알림이 만들어진다 (지연 수신 표시)', async () => {
      ctx.clock.set(DAY)
      const state = await motion({ zone: 'ENTRANCE', when: 'night' })
      const sent = state.recent[0]
      expect(sent?.label).toContain('야간으로 전송')
      expect(sent?.occurredAt).not.toBeNull()
      expect(sent?.newAlerts.map((a) => a.type)).toEqual(['ENTRANCE_APPROACH'])
      const event = await ctx.prisma.movementEvent.findFirstOrThrow({
        where: { householdId: user.householdId },
      })
      expect(event.isLate).toBe(true)
      expect(event.occurredAt.getTime()).toBe(Date.parse(sent!.occurredAt!))
    })

    it('낮에 그냥 보내면(now) 기록만 남고 알림은 만들어지지 않는다', async () => {
      ctx.clock.set(DAY)
      const state = await motion({ zone: 'ENTRANCE' })
      expect(state.recent[0]?.newAlerts).toEqual([])
      expect(await alertTypes()).toEqual([])
      expect(await eventCount()).toBe(1)
    })

    it('지금이 야간이면 발생 시각을 따로 싣지 않는다', async () => {
      const state = await motion({ zone: 'ENTRANCE', when: 'night' })
      expect(state.recent[0]?.occurredAt).toBeNull()
    })

    it('모니터링을 끈 상태에서는 야간을 찾을 수 없어 409 로 알린다', async () => {
      ctx.clock.set(DAY)
      await ctx.prisma.detectionSettings.create({
        data: { householdId: user.householdId, monitoringEnabled: false },
      })
      const res = await post('/motion', { zone: 'ENTRANCE', when: 'night' })
      expect(res.status).toBe(409)
      expect(JSON.stringify(await res.json())).toContain('야간 시간이 없습니다')
    })
  })

  describe('전송 기록과 새 알림', () => {
    it('전송마다 결과·새로 생긴 알림이 최신순으로 기록되고, 합쳐진 알림은 새 알림으로 세지 않는다', async () => {
      await motion({ zone: 'ENTRANCE' })
      const state = await motion({ zone: 'ENTRANCE' })
      expect(state.recent).toHaveLength(2)
      expect(state.recent[0]?.newAlerts).toEqual([]) // 같은 종류는 기존 알림에 합쳐짐
      expect(state.recent[1]?.newAlerts.map((a) => a.type)).toEqual(['ENTRANCE_APPROACH'])
      expect(Date.parse(state.recent[0]!.at)).toBeGreaterThanOrEqual(
        Date.parse(state.recent[1]!.at),
      )
    })

    it('배터리 변경은 신호로 전송되어 기록되고, 위급 수준이면 알림이 생긴다', async () => {
      await post('/sensors', { zone: 'BED_SIDE' })
      const res = await post('/battery', { zone: 'BED_SIDE', batteryPercent: 7 })
      const state = await parse(res)
      expect(state.recent[0]).toMatchObject({ label: '배터리 7% 보고', ok: true })
      expect(state.recent[0]?.requests).toEqual([{ eventId: null, status: 'OK', reason: null }])
      expect(state.recent[0]?.newAlerts.map((a) => a.type)).toEqual(['LOW_BATTERY'])
      expect(state.sensors[0]?.sensor?.batteryPercent).toBe(7)
    })

    it('기록은 최근 30건까지만 남는다', async () => {
      for (let i = 0; i < 32; i += 1) await motion({ zone: 'PATH' })
      expect((await parse(await client.get(`${BASE}/state`))).recent).toHaveLength(30)
    })

    it('전송에 실패하면 실패로 기록하고 오류를 돌려준다 (수집 API 에 닿지 못함)', async () => {
      await post('/sensors', { zone: 'PATH' })
      const sim = ctx.services.simulator!
      sim.setIngestBaseUrl('http://127.0.0.1:9')
      try {
        expect((await post('/motion', { zone: 'PATH' })).status).toBe(503)
        const state = await parse(await client.get(`${BASE}/state`))
        expect(state.recent[0]).toMatchObject({ ok: false, requests: [] })
        expect(state.recent[0]?.error).toContain('수집 API')
      } finally {
        sim.setIngestBaseUrl(ctx.baseUrl)
      }
    })
  })

  describe('연결 끊김 재현과 복구', () => {
    it('끊김을 바로 확인하면 신호가 오래 없었던 것으로 처리해 연결 점검이 알림을 만든다', async () => {
      await post('/sensors', { zone: 'BED_SIDE' })
      const state = await parse(
        await post('/silence', { zone: 'BED_SIDE', silenced: true, fastForward: true }),
      )
      expect(state.recent[0]?.label).toContain('연결 점검 실행')
      expect(state.recent[0]?.newAlerts.map((a) => a.type)).toEqual(['SENSOR_OFFLINE'])
      expect(state.sensors[0]).toMatchObject({ silenced: true })
      expect(state.sensors[0]?.sensor?.state).toBe('OFFLINE')
    })

    it('그냥 끊으면 신호만 멈추고 점검은 일어나지 않는다 (기준 시간이 지나야 끊김)', async () => {
      await post('/sensors', { zone: 'BED_SIDE' })
      const state = await parse(await post('/silence', { zone: 'BED_SIDE', silenced: true }))
      expect(state.recent[0]?.newAlerts).toEqual([])
      expect(state.sensors[0]?.sensor?.state).toBe('ONLINE')
      await ctx.services.pipeline.checkSensorConnections()
      expect(await alertTypes()).toEqual([])
      ctx.clock.advance(6 * MINUTE) // 기본 기준(5분)이 지남
      await ctx.services.pipeline.checkSensorConnections()
      expect(await alertTypes()).toContain('SENSOR_OFFLINE')
    })

    it('복구하면 신호가 다시 가서 연결 끊김 알림이 자동으로 종료되고 복구 알림이 남는다', async () => {
      await post('/sensors', { zone: 'BED_SIDE' })
      await post('/silence', { zone: 'BED_SIDE', silenced: true, fastForward: true })
      const state = await parse(await post('/silence', { zone: 'BED_SIDE', silenced: false }))
      expect(state.recent[0]).toMatchObject({ label: '연결 복구 — 신호 다시 전송', ok: true })
      expect(state.recent[0]?.newAlerts.map((a) => a.type)).toEqual(['SENSOR_RESTORED'])
      const offline = AlertListResponseSchema.parse(
        await (await client.get('/api/alerts?type=SENSOR_OFFLINE')).json(),
      ).alerts[0]
      expect(offline?.status).toBe('RESOLVED')
    })
  })
})
