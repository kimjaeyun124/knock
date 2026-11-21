import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  DEFAULT_DETECTION_SETTINGS,
  DetectionSettingsSchema,
  type DetectionSettingsInput,
} from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

describe('감지 설정 API', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold

  beforeAll(async () => {
    ctx = await createTestContext()
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
  })
  afterAll(async () => {
    await ctx.close()
  })

  async function loginAs(user: TestHousehold): Promise<TestClient> {
    const client = new TestClient(ctx.baseUrl)
    const res = await client.post('/api/auth/login', { email: user.email, password: user.password })
    expect(res.status).toBe(200)
    return client
  }

  const valid: DetectionSettingsInput = {
    monitoringEnabled: true,
    activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
    nightStart: '21:30',
    nightEnd: '05:45',
    sensitivity: 'HIGH',
    sequenceWindowMinutes: 15,
    cooldownMinutes: 20,
    reminderMinutes: 3,
    offlineAfterSeconds: 600,
    lowBatteryPercent: 25,
    criticalBatteryPercent: 8,
    retentionDays: 30,
  }

  it('로그인하지 않으면 조회도 수정도 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/settings/detection')).status).toBe(401)
    expect((await anonymous.put('/api/settings/detection', valid)).status).toBe(401)
  })

  it('처음 조회하면 기본값을 돌려주고, 이 기본값은 공유 상수와 같다', async () => {
    const client = await loginAs(a)
    const res = await client.get('/api/settings/detection')
    expect(res.status).toBe(200)
    const { updatedAt, ...settings } = DetectionSettingsSchema.parse(await res.json())
    expect(updatedAt).toBeTruthy()
    expect(settings).toEqual(DEFAULT_DETECTION_SETTINGS)
  })

  it('저장한 값이 다시 조회된다', async () => {
    const client = await loginAs(a)
    const put = await client.put('/api/settings/detection', valid)
    expect(put.status).toBe(200)

    const { updatedAt: _ignored, ...settings } = DetectionSettingsSchema.parse(
      await (await client.get('/api/settings/detection')).json(),
    )
    expect(settings).toEqual(valid)
  })

  it.each([
    ['시작과 종료 시각이 같음', { nightEnd: '21:30' }],
    ['시각 형식이 틀림', { nightStart: '25:00' }],
    ['알 수 없는 민감도', { sensitivity: 'EXTREME' }],
    ['배터리 위급 기준이 부족 기준 이상', { criticalBatteryPercent: 25 }],
    ['반복 억제 시간이 범위 밖', { cooldownMinutes: 0 }],
    ['연결 끊김 기준이 너무 짧음', { offlineAfterSeconds: 10 }],
    ['보관 기간이 정수가 아님', { retentionDays: 30.5 }],
  ])('잘못된 값은 저장하지 않는다: %s', async (_name, override) => {
    const client = await loginAs(a)
    const before = await (await client.get('/api/settings/detection')).json()

    const res = await client.put('/api/settings/detection', { ...valid, ...override })
    expect(res.status).toBe(400)
    expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('VALIDATION_ERROR')

    expect(await (await client.get('/api/settings/detection')).json()).toEqual(before)
  })

  it('일부 항목만 보내면 거부한다 (부분 저장 없음)', async () => {
    const client = await loginAs(a)
    const res = await client.put('/api/settings/detection', { sensitivity: 'LOW' })
    expect(res.status).toBe(400)
  })

  it('다른 가구의 설정은 보이지도, 바뀌지도 않는다', async () => {
    const clientA = await loginAs(a)
    const clientB = await loginAs(b)

    // A가 본문에 B의 householdId 를 끼워 넣어도 무시되고 A의 설정만 바뀐다.
    const attack = await clientA.put('/api/settings/detection', {
      ...valid,
      sensitivity: 'LOW',
      householdId: b.householdId,
    })
    expect(attack.status).toBe(200)

    const seenByB = DetectionSettingsSchema.parse(
      await (await clientB.get('/api/settings/detection')).json(),
    )
    expect(seenByB.sensitivity).toBe(DEFAULT_DETECTION_SETTINGS.sensitivity)

    const rowsB = await ctx.prisma.detectionSettings.findUnique({
      where: { householdId: b.householdId },
    })
    expect(rowsB?.sensitivity).toBe('MEDIUM')
    const rowsA = await ctx.prisma.detectionSettings.findUnique({
      where: { householdId: a.householdId },
    })
    expect(rowsA?.sensitivity).toBe('LOW')
  })

  it('허용되지 않은 출처에서 온 수정 요청은 403 이다', async () => {
    const client = await loginAs(a)
    const res = await client.put('/api/settings/detection', valid, {
      Origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })
})
