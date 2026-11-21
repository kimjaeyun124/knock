import { afterEach, describe, expect, it } from 'vitest'
import { ChannelSupportResponseSchema, CHANNEL_LABELS } from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { NIGHT } from '@/test-utils/scenario'
import { DeliveryError } from './types'
import { WatchNotificationAdapter } from './watch.adapter'

const contexts: TestContext[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.close()
})

describe('WatchNotificationAdapter — 스마트워치(추후 연동용)', () => {
  it('보낸 척하지 않는다: 연동되지 않음으로 보고하고, 보내면 다시 시도할 수 없는 실패가 된다', async () => {
    const adapter = new WatchNotificationAdapter()
    expect(adapter.mode()).toBe('NOT_CONFIGURED')
    expect(adapter.support()).toMatchObject({ implemented: false })
    const error = await adapter
      .send({} as never, { id: 'g', displayName: '보호자' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DeliveryError)
    expect((error as DeliveryError).retryable).toBe(false)
    await expect(adapter.sendTest({ id: 'g', displayName: '보호자' })).rejects.toBeInstanceOf(
      DeliveryError,
    )
  })

  it('Apple Watch·Wear OS 모두 지금은 전달할 수 없고, 필요한 작업을 알린다', () => {
    const platforms = new WatchNotificationAdapter().platforms()
    expect(platforms.map((p) => p.platform)).toEqual(['APPLE_WATCH', 'WEAR_OS'])
    for (const p of platforms) {
      expect(p.deliverable).toBe(false)
      expect(p.requires.length).toBeGreaterThan(0)
    }
  })
})

describe('채널 지원 현황과 전달 기록', () => {
  async function fixture() {
    const ctx = await createTestContext()
    contexts.push(ctx)
    ctx.clock.set(NIGHT)
    const user = await ctx.createHousehold()
    const client = await ctx.loginAs(user)
    return { ctx, user, client }
  }

  it('GET /api/system/channel-support — 구현된 채널과 아닌 채널을 구별한다', async () => {
    const { client } = await fixture()
    const body = ChannelSupportResponseSchema.parse(
      await (await client.get('/api/system/channel-support')).json(),
    )
    const byKey = Object.fromEntries(body.channels.map((c) => [c.key, c]))
    expect(byKey.IN_APP?.implemented).toBe(true)
    expect(byKey.WEB_PUSH?.implemented).toBe(false) // 이 테스트 서버에는 VAPID 키가 없다
    expect(byKey.WATCH).toMatchObject({ implemented: false })
    expect(byKey.WATCH?.note).toContain('아직 만들지 않았습니다')
    expect(byKey.SMS?.implemented).toBe(false)
    expect(body.watchPlatforms.every((p) => !p.deliverable)).toBe(true)
  })

  it('로그인하지 않으면 볼 수 없다', async () => {
    const ctx = await createTestContext()
    contexts.push(ctx)
    expect((await fetch(`${ctx.baseUrl}/api/system/channel-support`)).status).toBe(401)
  })

  it('알림이 생기면 스마트워치 채널에도 전달 기록이 "연동되지 않음"으로 남고, 전달 성공으로 세지 않는다', async () => {
    const { ctx, user } = await fixture()
    const sensor = await ctx.createSensor(user.householdId, { name: '현관', zone: 'ENTRANCE' })
    await fetch(`${ctx.baseUrl}/api/ingest/v1/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sensor.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ eventId: 'evt-watch-0001', type: 'MOTION' }] }),
    })
    const rows = await ctx.prisma.notificationDelivery.findMany({ where: { channel: 'WATCH' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'NOT_CONFIGURED', attempts: 0, providerMode: null })
    expect(CHANNEL_LABELS.WATCH).toBe('스마트워치')
  })
})
