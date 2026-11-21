import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertListResponseSchema,
  DEFAULT_DETECTION_SETTINGS,
  DetectionSettingsSchema,
  SensorResponseSchema,
  type DetectionSettingsInput,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { MINUTE, NIGHT, TestDevice } from '@/test-utils/scenario'

/**
 * 설정을 저장하면 그 값이 실제 이벤트 처리(알림을 만들지 말지)에 반영되는지 확인한다.
 * NIGHT 는 한국 시각 일요일 02:00 이므로 "토요일 밤에 시작된 야간 구간"에 속한다.
 */
const contexts: TestContext[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.close()
})

const SATURDAY = 5

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
  const types = async () =>
    AlertListResponseSchema.parse(await (await client.get('/api/alerts')).json()).alerts.map(
      (a) => a.type,
    )
  const save = (patch: Partial<DetectionSettingsInput>) =>
    client.put('/api/settings/detection', { ...DEFAULT_DETECTION_SETTINGS, ...patch })
  return { ctx, client, make, types, save }
}

describe('모니터링 사용 여부', () => {
  it('끄면 움직임은 기록되지만 움직임 알림은 만들어지지 않고, 다시 켜면 만들어진다', async () => {
    const { ctx, make, types, save } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    expect((await save({ monitoringEnabled: false })).status).toBe(200)
    await door.device.motion()
    expect(await types()).toEqual([])
    expect(await ctx.prisma.movementEvent.count()).toBe(1)

    expect((await save({ monitoringEnabled: true })).status).toBe(200)
    await door.device.motion(MINUTE)
    expect(await types()).toEqual(['ENTRANCE_APPROACH'])
  })

  it('모니터링을 꺼도 센서 배터리 알림은 만들어진다 (센서 알림은 별개)', async () => {
    const { make, types, save } = await fixture()
    const bed = await make('BED_SIDE', '침대 옆')
    await save({ monitoringEnabled: false })
    await bed.device.heartbeat({ batteryPercent: 15 })
    expect(await types()).toEqual(['LOW_BATTERY'])
  })
})

describe('요일별 일정', () => {
  it('그 야간 구간이 시작된 요일이 일정에 없으면 알림을 만들지 않는다', async () => {
    const { make, types, save } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    await save({ activeWeekdays: [0, 1, 2, 3, 4, 6] }) // 토요일 제외
    await door.device.motion()
    expect(await types()).toEqual([])

    await save({ activeWeekdays: [SATURDAY] })
    await door.device.motion(MINUTE)
    expect(await types()).toEqual(['ENTRANCE_APPROACH'])
  })
})

describe('센서별 민감도 (서버 판단 기준)', () => {
  it('센서에 정한 민감도가 가구 기본보다 우선하고, 비우면 기본을 다시 따른다', async () => {
    const { client, make, types, save } = await fixture()
    const bed = await make('BED_SIDE', '침대 옆')
    await save({ sensitivity: 'LOW' })

    const patched = await client.request(`/api/sensors/${bed.id}`, {
      method: 'PATCH',
      body: { sensitivity: 'HIGH' },
    })
    expect(patched.status).toBe(200)
    const { sensor } = SensorResponseSchema.parse(await patched.json())
    expect(sensor.sensitivity).toBe('HIGH')
    // 센서 하드웨어의 감도는 바꾸지 못한다. 서버가 신호를 해석하는 기준만 바뀐다.
    expect(sensor.hardwareSensitivitySupported).toBe(false)

    await bed.device.motion()
    expect(await types()).toEqual(['BED_AREA_ACTIVITY'])

    const cleared = await client.request(`/api/sensors/${bed.id}`, {
      method: 'PATCH',
      body: { sensitivity: null },
    })
    expect(SensorResponseSchema.parse(await cleared.json()).sensor.sensitivity).toBeNull()
  })

  it('알 수 없는 값은 400, 다른 가구의 센서는 404 이다', async () => {
    const a = await fixture()
    const sensor = await a.make('BED_SIDE', '침대 옆')
    const bad = await a.client.request(`/api/sensors/${sensor.id}`, {
      method: 'PATCH',
      body: { sensitivity: 'EXTREME' },
    })
    expect(bad.status).toBe(400)

    const other = await a.ctx.loginAs(await a.ctx.createHousehold())
    const stolen = await other.request(`/api/sensors/${sensor.id}`, {
      method: 'PATCH',
      body: { sensitivity: 'HIGH' },
    })
    expect(stolen.status).toBe(404)
  })
})

describe('설정 저장 검증', () => {
  it('모니터링을 켠 채 요일을 하나도 고르지 않으면 거부하고, 끈 상태면 허용한다', async () => {
    const { save } = await fixture()
    expect((await save({ monitoringEnabled: true, activeWeekdays: [] })).status).toBe(400)
    expect((await save({ monitoringEnabled: false, activeWeekdays: [] })).status).toBe(200)
  })

  it('범위 밖 요일은 거부하고, 중복·순서 없는 요일은 정리해 저장한다', async () => {
    const { client, save } = await fixture()
    expect((await save({ activeWeekdays: [0, 7] })).status).toBe(400)
    expect((await save({ activeWeekdays: [4, 0, 4, 2] })).status).toBe(200)
    const saved = DetectionSettingsSchema.parse(
      await (await client.get('/api/settings/detection')).json(),
    )
    expect(saved.activeWeekdays).toEqual([0, 2, 4])
  })

  it('이전 형식(모니터링·요일 항목이 없는 요청)도 받아 기본값(켜짐·매일)으로 채운다', async () => {
    const { client } = await fixture()
    const { monitoringEnabled: _m, activeWeekdays: _w, ...legacy } = DEFAULT_DETECTION_SETTINGS
    const res = await client.put('/api/settings/detection', legacy)
    expect(res.status).toBe(200)
    expect(DetectionSettingsSchema.parse(await res.json())).toMatchObject({
      monitoringEnabled: true,
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
    })
  })
})
