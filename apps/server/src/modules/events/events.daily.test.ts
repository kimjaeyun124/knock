import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema, DailySummaryResponseSchema } from '@tetris/shared'
import { EventService } from '@/services/event.service'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

// 한국 시간 2026-11-14 10:00 (= UTC 01:00)
const NOW = new Date('2026-11-14T01:00:00.000Z')
const kst = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`)

describe('날짜별 요약 (GET /api/events/daily)', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold
  let client: TestClient
  let service: EventService
  let sensor: { id: string }
  let n = 0

  const event = (when: Date, origin: 'REAL' | 'SIMULATED' = 'REAL', household = a) =>
    ctx.prisma.movementEvent.create({
      data: {
        householdId: household.householdId,
        sensorId: sensor.id,
        zone: 'BED_SIDE',
        origin,
        deviceEventId: `daily-${String(++n).padStart(4, '0')}`,
        occurredAt: when,
      },
    })
  const alert = (
    when: Date,
    type: 'BED_TO_PATH' | 'SENSOR_OFFLINE' | 'LOW_BATTERY',
    severity: 'INFO' | 'NOTICE' | 'URGENT',
  ) =>
    ctx.prisma.alert.create({
      data: {
        householdId: a.householdId,
        type,
        severity,
        origin: 'REAL',
        title: '테스트 알림',
        message: '테스트',
        triggeredAt: when,
        dedupeKey: `daily-${++n}`,
      },
    })

  beforeAll(async () => {
    ctx = await createTestContext()
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
    client = await ctx.loginAs(a)
    service = new EventService(ctx.prisma)
    sensor = await ctx.createSensor(a.householdId, { name: '침대 옆', zone: 'BED_SIDE' })

    await event(kst('2026-11-14', '00:00')) // 오늘 0시 정각은 오늘이다
    await event(kst('2026-11-14', '09:30'))
    await event(kst('2026-11-13', '23:59')) // 어제 마지막 분
    await event(kst('2026-11-12', '03:00'), 'SIMULATED')
    await event(kst('2026-11-11', '23:59')) // 범위(3일) 밖
    await event(kst('2026-11-14', '09:00'), 'REAL', b) // 다른 가구
    await alert(kst('2026-11-14', '02:00'), 'BED_TO_PATH', 'URGENT')
    await alert(kst('2026-11-13', '02:00'), 'BED_TO_PATH', 'NOTICE')
    await alert(kst('2026-11-13', '03:00'), 'SENSOR_OFFLINE', 'NOTICE') // 움직임 알림이 아님
    await alert(kst('2026-11-13', '04:00'), 'BED_TO_PATH', 'INFO') // 참고 수준은 주의가 아님
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('오늘을 포함한 N일을 오래된 날부터, 한국 시간 날짜 기준으로 센다', async () => {
    const summary = await service.dailySummary(a.householdId, 3, NOW)
    expect(summary.days).toEqual([
      { date: '2026-11-12', movements: 1, simulatedMovements: 1, attentionAlerts: 0 },
      { date: '2026-11-13', movements: 1, simulatedMovements: 0, attentionAlerts: 1 },
      { date: '2026-11-14', movements: 2, simulatedMovements: 0, attentionAlerts: 1 },
    ])
    expect(summary.generatedAt).toBe(NOW.toISOString())
  })

  it('기록이 없는 날도 0건으로 채운다', async () => {
    const summary = await service.dailySummary(a.householdId, 7, NOW)
    expect(summary.days).toHaveLength(7)
    expect(summary.days[0]).toEqual({
      date: '2026-11-08',
      movements: 0,
      simulatedMovements: 0,
      attentionAlerts: 0,
    })
  })

  it('다른 가구의 기록은 세지 않는다', async () => {
    const other = await service.dailySummary(b.householdId, 1, NOW)
    expect(other.days).toEqual([
      { date: '2026-11-14', movements: 1, simulatedMovements: 0, attentionAlerts: 0 },
    ])
  })

  it('API: 기본은 7일이고 응답 형식을 지킨다', async () => {
    const res = await client.get('/api/events/daily')
    expect(res.status).toBe(200)
    const body = DailySummaryResponseSchema.parse(await res.json())
    expect(body.days).toHaveLength(7)
  })

  it('API: 잘못된 일수는 400, 로그인하지 않으면 401 이다', async () => {
    for (const days of ['0', '32', 'abc']) {
      const res = await client.get(`/api/events/daily?days=${days}`)
      expect(res.status, days).toBe(400)
      ApiErrorBodySchema.parse(await res.json())
    }
    expect((await new TestClient(ctx.baseUrl).get('/api/events/daily')).status).toBe(401)
  })
})
