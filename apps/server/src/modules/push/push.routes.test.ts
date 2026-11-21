import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  PushConfigResponseSchema,
  PushSubscribeResponseSchema,
  PushSubscriptionsResponseSchema,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MAX_PUSH_SUBSCRIPTIONS_PER_GUARDIAN } from '@/services/push.service'

const subscription = (n = 1) => ({
  endpoint: `https://push.example.com/send/device-${n}`,
  keys: { p256dh: `p256dh-key-${n}`, auth: `auth-secret-${n}` },
})

describe('브라우저 푸시 등록 API', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext({ push: { sender: undefined } })
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('로그인하지 않으면 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/push/config')).status).toBe(401)
    expect((await anonymous.get('/api/push/subscriptions')).status).toBe(401)
    expect((await anonymous.post('/api/push/subscribe', subscription())).status).toBe(401)
  })

  it('설정되어 있으면 공개 키를 알려 준다 (비공개 키는 절대 아님)', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.get('/api/push/config')
    const text = await res.text()
    expect(PushConfigResponseSchema.parse(JSON.parse(text))).toEqual({
      configured: true,
      publicKey: 'test-public-key',
    })
    expect(text).not.toContain('test-private-key')
  })

  it('기기를 등록하고 목록에서 본다. 응답에는 호스트만 있고 주소 전체와 키는 없다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.post('/api/push/subscribe', subscription())
    expect(res.status).toBe(201)
    const created = await res.text()
    expect(PushSubscribeResponseSchema.parse(JSON.parse(created)).subscription.host).toBe(
      'push.example.com',
    )
    for (const secret of ['device-1', 'p256dh-key-1', 'auth-secret-1']) {
      expect(created).not.toContain(secret)
    }

    const list = await (await client.get('/api/push/subscriptions')).text()
    expect(PushSubscriptionsResponseSchema.parse(JSON.parse(list)).subscriptions).toHaveLength(1)
    for (const secret of ['device-1', 'p256dh-key-1', 'auth-secret-1']) {
      expect(list).not.toContain(secret)
    }
  })

  it('같은 기기를 다시 등록해도 늘어나지 않고 키만 갱신된다', async () => {
    const user = await ctx.createHousehold()
    const client = await ctx.loginAs(user)
    await client.post('/api/push/subscribe', subscription(2))
    await client.post('/api/push/subscribe', {
      endpoint: subscription(2).endpoint,
      keys: { p256dh: 'new-p256dh', auth: 'new-auth' },
    })
    const rows = await ctx.prisma.pushSubscription.findMany({
      where: { guardianId: user.guardianId },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ p256dh: 'new-p256dh', auth: 'new-auth' })
  })

  it.each([
    ['http 주소', 'http://push.example.com/x'],
    ['localhost', 'https://localhost/x'],
    ['IP 주소', 'https://10.0.0.5/x'],
    ['내부 이름', 'https://metadata.google.internal/x'],
  ])('서버가 내부로 요청을 보내게 될 주소는 거부한다 (400): %s', async (_name, endpoint) => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.post('/api/push/subscribe', { ...subscription(), endpoint })
    expect(res.status).toBe(400)
    expect(await ctx.prisma.pushSubscription.count({ where: { endpoint } })).toBe(0)
  })

  it('형식이 틀린 요청은 400 이다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    expect((await client.post('/api/push/subscribe', {})).status).toBe(400)
    expect(
      (
        await client.post('/api/push/subscribe', {
          endpoint: subscription().endpoint,
          keys: { p256dh: '', auth: 'a' },
        })
      ).status,
    ).toBe(400)
  })

  it('보호자 한 명이 등록할 수 있는 기기 수에는 한도가 있다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    for (let n = 0; n < MAX_PUSH_SUBSCRIPTIONS_PER_GUARDIAN; n += 1) {
      expect((await client.post('/api/push/subscribe', subscription(100 + n))).status).toBe(201)
    }
    const res = await client.post('/api/push/subscribe', subscription(999))
    expect(res.status).toBe(409)
    expect(ApiErrorBodySchema.parse(await res.json()).error.message).toContain('최대')
  })

  it('본인의 기기만 지울 수 있다 (다른 보호자의 기기는 404)', async () => {
    const owner = await ctx.loginAs(await ctx.createHousehold())
    const other = await ctx.loginAs(await ctx.createHousehold())
    const { subscription: created } = PushSubscribeResponseSchema.parse(
      await (await owner.post('/api/push/subscribe', subscription(3))).json(),
    )
    expect((await other.delete(`/api/push/subscriptions/${created.id}`)).status).toBe(404)
    expect(await ctx.prisma.pushSubscription.count({ where: { id: created.id } })).toBe(1)
    expect((await owner.delete(`/api/push/subscriptions/${created.id}`)).status).toBe(200)
    expect(await ctx.prisma.pushSubscription.count({ where: { id: created.id } })).toBe(0)
  })

  it('허용되지 않은 출처의 요청은 403 이다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.post('/api/push/subscribe', subscription(4), {
      Origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
  })

  it('푸시가 설정되지 않은 서버에서는 등록할 수 없다 (409)', async () => {
    const off = await createTestContext()
    try {
      const client = await off.loginAs(await off.createHousehold())
      expect(
        PushConfigResponseSchema.parse(await (await client.get('/api/push/config')).json()),
      ).toEqual({
        configured: false,
        publicKey: null,
      })
      expect((await client.post('/api/push/subscribe', subscription())).status).toBe(409)
    } finally {
      await off.close()
    }
  })
})
