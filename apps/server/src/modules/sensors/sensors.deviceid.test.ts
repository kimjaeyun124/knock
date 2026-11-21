import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SensorWithTokenResponseSchema } from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'

describe('센서 장치 번호(deviceId)', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('등록할 때 장치 번호를 받고, 같은 가구의 다른 센서가 같은 번호를 쓰면 409 이다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const first = await client.post('/api/sensors', {
      name: '복도',
      zone: 'PATH',
      deviceId: 'SN-001',
    })
    expect(first.status).toBe(201)
    expect(SensorWithTokenResponseSchema.parse(await first.json()).sensor.deviceId).toBe('SN-001')

    const dup = await client.post('/api/sensors', {
      name: '현관',
      zone: 'ENTRANCE',
      deviceId: 'SN-001',
    })
    expect(dup.status).toBe(409)
    expect(JSON.stringify(await dup.json())).toContain('이미 등록된 장치 번호')
  })

  it('다른 가구는 같은 번호를 쓸 수 있고, 번호 없이도 등록된다', async () => {
    const a = await ctx.loginAs(await ctx.createHousehold())
    const b = await ctx.loginAs(await ctx.createHousehold())
    expect(
      (await a.post('/api/sensors', { name: 'A', zone: 'PATH', deviceId: 'SAME' })).status,
    ).toBe(201)
    expect(
      (await b.post('/api/sensors', { name: 'B', zone: 'PATH', deviceId: 'SAME' })).status,
    ).toBe(201)
    const none = await a.post('/api/sensors', { name: '번호 없음', zone: 'PATH' })
    expect(SensorWithTokenResponseSchema.parse(await none.json()).sensor.deviceId).toBeNull()
  })

  it('잘못된 장치 번호(공백·특수문자·너무 김)는 400 이다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    for (const deviceId of ['', 'has space', 'a/b', 'x'.repeat(101)]) {
      const res = await client.post('/api/sensors', { name: 's', zone: 'PATH', deviceId })
      expect(res.status, deviceId).toBe(400)
    }
  })

  it('수정으로 번호를 바꾸거나 지울 수 있고, 다른 센서의 번호와는 겹칠 수 없다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const a = SensorWithTokenResponseSchema.parse(
      await (
        await client.post('/api/sensors', { name: 'A', zone: 'PATH', deviceId: 'A-1' })
      ).json(),
    ).sensor
    await client.post('/api/sensors', { name: 'B', zone: 'PATH', deviceId: 'B-1' })

    const clash = await client.request(`/api/sensors/${a.id}`, {
      method: 'PATCH',
      body: { deviceId: 'B-1' },
    })
    expect(clash.status).toBe(409)
    const cleared = await client.request(`/api/sensors/${a.id}`, {
      method: 'PATCH',
      body: { deviceId: null },
    })
    expect(cleared.status).toBe(200)
    expect(((await cleared.json()) as { sensor: { deviceId: unknown } }).sensor.deviceId).toBeNull()
  })
})
