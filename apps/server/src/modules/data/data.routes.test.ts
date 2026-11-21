import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DataSummaryResponseSchema, DeleteSimulatedResponseSchema } from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { NIGHT, TestDevice } from '@/test-utils/scenario'

describe('데이터 관리 API', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestContext({ simulator: true })
    ctx.clock.set(NIGHT)
  })
  afterAll(async () => {
    ctx.services.simulator?.stop()
    await ctx.close()
  })

  async function seed() {
    const user = await ctx.createHousehold()
    const client = await ctx.loginAs(user)
    const real = new TestDevice(
      ctx,
      (await ctx.createSensor(user.householdId, { zone: 'ENTRANCE' })).token,
    )
    await real.motion()
    await client.post('/api/dev/simulator/sensors') // 세 구역의 시뮬레이션 센서
    await client.post('/api/dev/simulator/motion', { zone: 'ENTRANCE' })
    return { user, client }
  }
  const summary = async (client: TestClient) =>
    DataSummaryResponseSchema.parse(await (await client.get('/api/data/summary')).json())

  it('로그인하지 않으면 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/data/summary')).status).toBe(401)
    expect((await anonymous.delete('/api/data/simulated')).status).toBe(401)
  })

  it('실제와 시뮬레이션 데이터의 양을 따로 센다', async () => {
    const { client } = await seed()
    expect(await summary(client)).toEqual({
      real: { sensors: 1, events: 1, alerts: 1 },
      simulated: { sensors: 3, events: 1, alerts: 1 },
    })
  })

  it('시뮬레이션 데이터만 지우고 실제 데이터는 그대로 둔다', async () => {
    const { client, user } = await seed()
    const res = await client.delete('/api/data/simulated')
    expect(res.status).toBe(200)
    expect(DeleteSimulatedResponseSchema.parse(await res.json()).deleted).toEqual({
      sensors: 3,
      events: 1,
      alerts: 1,
    })
    expect(await summary(client)).toEqual({
      real: { sensors: 1, events: 1, alerts: 1 },
      simulated: { sensors: 0, events: 0, alerts: 0 },
    })
    const realAlert = await ctx.prisma.alert.findFirstOrThrow({
      where: { householdId: user.householdId },
    })
    expect(realAlert.origin).toBe('REAL')
    // 알림의 근거·전달 기록이 고아로 남지 않는다
    expect(
      await ctx.prisma.notificationDelivery.count({
        where: { alert: { householdId: user.householdId, origin: 'SIMULATED' } },
      }),
    ).toBe(0)
  })

  it('지운 뒤에도 시뮬레이터가 다시 센서를 만들어 동작한다', async () => {
    const { client } = await seed()
    await client.delete('/api/data/simulated')
    expect((await client.post('/api/dev/simulator/motion', { zone: 'PATH' })).status).toBe(200)
    expect((await summary(client)).simulated).toMatchObject({ sensors: 1, events: 1 })
  })

  it('다른 가구의 데이터는 지우지 않는다', async () => {
    const a = await seed()
    const b = await seed()
    await a.client.delete('/api/data/simulated')
    expect((await summary(b.client)).simulated.sensors).toBe(3)
  })

  it('시뮬레이터가 꺼져 있어도 남은 시뮬레이션 데이터를 지울 수 있다', async () => {
    const off = await createTestContext()
    try {
      const user = await off.createHousehold()
      const client = await off.loginAs(user)
      const sim = await off.createSensor(user.householdId, { origin: 'SIMULATED' })
      expect(sim.id).toBeTruthy()
      expect((await summary(client)).simulated.sensors).toBe(1)
      const res = await client.delete('/api/data/simulated')
      expect(DeleteSimulatedResponseSchema.parse(await res.json()).deleted.sensors).toBe(1)
    } finally {
      await off.close()
    }
  })
})
