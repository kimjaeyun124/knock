import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { NIGHT, TestDevice } from '@/test-utils/scenario'

describe('실제 알림과 시뮬레이션 알림은 합쳐지지 않는다', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
    ctx.clock.set(NIGHT)
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('같은 종류·같은 구역이라도 출처가 다르면 각각 알림이 생긴다', async () => {
    const user = await ctx.createHousehold()
    const real = new TestDevice(
      ctx,
      (await ctx.createSensor(user.householdId, { zone: 'ENTRANCE' })).token,
    )
    const sim = new TestDevice(
      ctx,
      (await ctx.createSensor(user.householdId, { zone: 'ENTRANCE', origin: 'SIMULATED' })).token,
    )
    await real.motion()
    await sim.motion()
    await real.motion() // 같은 출처끼리는 억제 시간 안에서 합쳐진다
    const alerts = await ctx.prisma.alert.findMany({
      where: { householdId: user.householdId },
      orderBy: { origin: 'asc' },
    })
    expect(alerts.map((a) => [a.origin, a.occurrences])).toEqual([
      ['REAL', 2],
      ['SIMULATED', 1],
    ])
  })
})
