import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertListResponseSchema,
  AlertPreferencesSchema,
  ApiErrorBodySchema,
  DEFAULT_ALERT_PREFERENCES,
  type AlertPreferencesInput,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice } from '@/test-utils/scenario'

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
  const make = async (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE', name: string) => {
    const sensor = await ctx.createSensor(user.householdId, { zone, name })
    return new TestDevice(ctx, sensor.token)
  }
  const types = async () =>
    AlertListResponseSchema.parse(await (await client.get('/api/alerts')).json()).alerts.map(
      (a) => a.type,
    )
  const save = (input: AlertPreferencesInput) => client.put('/api/settings/alerts', input)
  return { ctx, client, make, types, save }
}

describe('알림 수신 설정 API', () => {
  it('로그인하지 않으면 401 이다', async () => {
    const { ctx } = await fixture()
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/settings/alerts')).status).toBe(401)
    expect((await anonymous.put('/api/settings/alerts', DEFAULT_ALERT_PREFERENCES)).status).toBe(
      401,
    )
  })

  it('처음에는 모두 받는 기본값이고, 이 값은 공유 상수와 같다', async () => {
    const { client } = await fixture()
    const { updatedAt, ...prefs } = AlertPreferencesSchema.parse(
      await (await client.get('/api/settings/alerts')).json(),
    )
    expect(updatedAt).toBeTruthy()
    expect(prefs).toEqual(DEFAULT_ALERT_PREFERENCES)
  })

  it('저장한 값이 다시 조회되고, 잘못된 값은 400 이다', async () => {
    const { client, save } = await fixture()
    const next = { ...DEFAULT_ALERT_PREFERENCES, bedAreaActivity: false, sensorIssues: false }
    expect((await save(next)).status).toBe(200)
    const { updatedAt: _ignored, ...prefs } = AlertPreferencesSchema.parse(
      await (await client.get('/api/settings/alerts')).json(),
    )
    expect(prefs).toEqual(next)

    const res = await client.put('/api/settings/alerts', { ...next, bedToPath: 'yes' })
    expect(res.status).toBe(400)
    expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('VALIDATION_ERROR')
    const missing = await client.put('/api/settings/alerts', { bedToPath: true })
    expect(missing.status).toBe(400)
  })

  it('다른 가구의 설정은 바뀌지 않는다', async () => {
    const a = await fixture()
    const b = await fixture()
    await a.save({ ...DEFAULT_ALERT_PREFERENCES, entranceApproach: false })
    const { entranceApproach } = AlertPreferencesSchema.parse(
      await (await b.client.get('/api/settings/alerts')).json(),
    )
    expect(entranceApproach).toBe(true)
  })
})

describe('받지 않기로 한 알림은 만들지 않는다', () => {
  it('현관 근처 움직임을 끄면 그 알림만 만들어지지 않고 움직임 기록은 남는다', async () => {
    const { ctx, client, make, types, save } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    await save({ ...DEFAULT_ALERT_PREFERENCES, entranceApproach: false })
    await door.motion()
    expect(await types()).toEqual([])
    // 신호 자체는 저장되어 기록에 남는다.
    expect(await ctx.prisma.movementEvent.count()).toBe(1)

    await save(DEFAULT_ALERT_PREFERENCES)
    await door.motion(MINUTE)
    expect(await types()).toEqual(['ENTRANCE_APPROACH'])
    expect(client).toBeTruthy()
  })

  it('배터리 알림만 끄면 배터리 부족 알림이 만들어지지 않지만 센서 상태는 그대로 낮게 표시된다', async () => {
    const { client, make, types, save } = await fixture()
    const bed = await make('BED_SIDE', '침대 옆')
    await save({ ...DEFAULT_ALERT_PREFERENCES, lowBattery: false })
    await bed.heartbeat({ batteryPercent: 15 })
    expect(await types()).toEqual([])
    const sensors = (await (await client.get('/api/sensors')).json()) as {
      sensors: { batteryLevel: string }[]
    }
    expect(sensors.sensors[0]?.batteryLevel).toBe('LOW')
  })
})
