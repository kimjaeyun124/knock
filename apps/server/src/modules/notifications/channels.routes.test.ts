import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  ChannelTestResponseSchema,
  IntegrationsResponseSchema,
  type Channel,
} from '@tetris/shared'
import {
  PushGoneError,
  type PushSender,
  type PushTarget,
} from '@/integrations/notifications/web-push.adapter'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice, openSocket } from '@/test-utils/scenario'

class FakePushSender implements PushSender {
  sent: { target: PushTarget; payload: Record<string, unknown> }[] = []
  /** endpoint 에 이 문자열이 들어 있으면 해당 방식으로 실패시킨다 */
  failures = new Map<string, 'gone' | 'error'>()
  send(target: PushTarget, payload: string): Promise<void> {
    for (const [needle, kind] of this.failures) {
      if (target.endpoint.includes(needle)) {
        return Promise.reject(kind === 'gone' ? new PushGoneError() : new Error('push service 500'))
      }
    }
    this.sent.push({ target, payload: JSON.parse(payload) as Record<string, unknown> })
    return Promise.resolve()
  }
}

const sub = (name: string) => ({
  endpoint: `https://push.example.com/send/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
})

describe('알림 채널 현황과 테스트 발송', () => {
  let ctx: TestContext
  let sender: FakePushSender

  beforeAll(async () => {
    sender = new FakePushSender()
    ctx = await createTestContext({ push: { sender } })
    ctx.clock.set(NIGHT)
  })
  afterAll(async () => {
    await ctx.close()
  })

  async function guardian(): Promise<{ user: TestHousehold; client: TestClient }> {
    const user = await ctx.createHousehold()
    return { user, client: await ctx.loginAs(user) }
  }
  const integrations = async (client: TestClient) =>
    IntegrationsResponseSchema.parse(await (await client.get('/api/system/integrations')).json())
      .integrations
  const test = async (client: TestClient, channel: Channel) =>
    client.post('/api/notifications/test', { channel })

  describe('연동 현황', () => {
    it('로그인하지 않으면 401 이다', async () => {
      const anonymous = new TestClient(ctx.baseUrl)
      expect((await anonymous.get('/api/system/integrations')).status).toBe(401)
      expect((await anonymous.post('/api/notifications/test', { channel: 'IN_APP' })).status).toBe(
        401,
      )
    })

    it('채널별로 실제 연동 / 연동되지 않음을 정확히 알린다 (푸시 설정됨)', async () => {
      const { client } = await guardian()
      const list = await integrations(client)
      expect(list.map((i) => [i.key, i.mode])).toEqual([
        ['IN_APP', 'REAL'],
        ['WEB_PUSH', 'REAL'],
        ['WATCH', 'NOT_CONFIGURED'],
        ['SMS', 'NOT_CONFIGURED'],
        ['KAKAO', 'NOT_CONFIGURED'],
      ])
      expect(list.every((i) => i.lastSuccessAt === null)).toBe(true)
    })

    it('푸시가 설정되지 않은 서버에서는 푸시도 "연동되지 않음"이다', async () => {
      const off = await createTestContext()
      try {
        const client = await off.loginAs(await off.createHousehold())
        const list = IntegrationsResponseSchema.parse(
          await (await client.get('/api/system/integrations')).json(),
        ).integrations
        expect(list.find((i) => i.key === 'WEB_PUSH')?.mode).toBe('NOT_CONFIGURED')
      } finally {
        await off.close()
      }
    })
  })

  describe('테스트 발송', () => {
    it('연동되지 않은 채널은 보낸 척하지 않고 그대로 알린다', async () => {
      const { client } = await guardian()
      for (const channel of ['SMS', 'KAKAO'] as const) {
        const body = ChannelTestResponseSchema.parse(await (await test(client, channel)).json())
        expect(body).toMatchObject({ channel, status: 'NOT_CONFIGURED', mode: null, error: null })
      }
    })

    it('앱 화면이 열려 있으면 화면에 도착하고 마지막 성공 시각이 남는다', async () => {
      const { client } = await guardian()
      const screen = await openSocket(ctx.baseUrl, client)
      try {
        const body = ChannelTestResponseSchema.parse(await (await test(client, 'IN_APP')).json())
        expect(body).toMatchObject({ status: 'SENT', mode: 'REAL', error: null })
        await screen.waitForCount('notification.test', 1)
        const inApp = (await integrations(client)).find((i) => i.key === 'IN_APP')
        expect(inApp?.lastSuccessAt).toBe(ctx.clock.now().toISOString())
      } finally {
        screen.close()
      }
    })

    it('앱 화면이 열려 있지 않으면 실패로 알리고 성공 시각은 남지 않는다', async () => {
      const { client } = await guardian()
      const body = ChannelTestResponseSchema.parse(await (await test(client, 'IN_APP')).json())
      expect(body.status).toBe('FAILED')
      expect(body.error).toContain('앱 화면이 열려 있지 않습니다')
      expect((await integrations(client)).find((i) => i.key === 'IN_APP')?.lastSuccessAt).toBeNull()
    })

    it('푸시: 등록한 기기가 없으면 실패하고 이유를 알려 준다', async () => {
      const { client } = await guardian()
      const body = ChannelTestResponseSchema.parse(await (await test(client, 'WEB_PUSH')).json())
      expect(body).toMatchObject({ status: 'FAILED', mode: 'REAL' })
      expect(body.error).toContain('등록한 기기가 없습니다')
    })

    it('푸시: 등록한 기기로 테스트가 가고, 알림 내용이 아닌 테스트 문구가 간다', async () => {
      const { client } = await guardian()
      await client.post('/api/push/subscribe', sub('phone'))
      sender.sent = []
      const body = ChannelTestResponseSchema.parse(await (await test(client, 'WEB_PUSH')).json())
      expect(body.status).toBe('SENT')
      expect(sender.sent).toHaveLength(1)
      expect(sender.sent[0]?.payload).toMatchObject({ type: 'test', title: '테스트 알림입니다' })
      expect(sender.sent[0]?.target.endpoint).toBe(sub('phone').endpoint)
    })

    it('푸시 서비스가 구독 만료(410)로 답하면 그 기기를 목록에서 지우고 실패로 알린다', async () => {
      const { client, user } = await guardian()
      await client.post('/api/push/subscribe', sub('expired-device'))
      sender.failures.set('expired-device', 'gone')
      try {
        const body = ChannelTestResponseSchema.parse(await (await test(client, 'WEB_PUSH')).json())
        expect(body.status).toBe('FAILED')
        expect(body.error).toContain('만료')
      } finally {
        sender.failures.clear()
      }
      expect(
        await ctx.prisma.pushSubscription.count({ where: { guardianId: user.guardianId } }),
      ).toBe(0)
    })

    it('테스트 발송은 알림이나 전달 기록을 만들지 않는다', async () => {
      const { client, user } = await guardian()
      await client.post('/api/push/subscribe', sub('quiet'))
      await test(client, 'WEB_PUSH')
      expect(await ctx.prisma.alert.count({ where: { householdId: user.householdId } })).toBe(0)
      expect(
        await ctx.prisma.notificationDelivery.count({ where: { guardianId: user.guardianId } }),
      ).toBe(0)
    })

    it('같은 채널을 이어서 보내면 429, 잠시 뒤에는 다시 보낼 수 있다', async () => {
      const { client } = await guardian()
      expect((await test(client, 'SMS')).status).toBe(200)
      const res = await test(client, 'SMS')
      expect(res.status).toBe(429)
      expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('RATE_LIMITED')
      ctx.clock.advance(6_000)
      expect((await test(client, 'SMS')).status).toBe(200)
    })

    it('알 수 없는 채널은 400 이다', async () => {
      const { client } = await guardian()
      expect((await client.post('/api/notifications/test', { channel: 'FAX' })).status).toBe(400)
    })

    it('허용되지 않은 출처의 요청은 403 이다', async () => {
      const { client } = await guardian()
      const res = await client.post(
        '/api/notifications/test',
        { channel: 'SMS' },
        { Origin: 'https://evil.example' },
      )
      expect(res.status).toBe(403)
    })
  })

  describe('실제 알림의 푸시 전달', () => {
    async function entranceAlert(user: TestHousehold, origin: 'REAL' | 'SIMULATED' = 'REAL') {
      const device = new TestDevice(
        ctx,
        (await ctx.createSensor(user.householdId, { zone: 'ENTRANCE', origin })).token,
      )
      await device.motion()
    }
    const deliveries = (guardianId: string, channel: Channel) =>
      ctx.prisma.notificationDelivery.findMany({ where: { guardianId, channel } })

    it('등록한 기기에 알림이 가고, 전달 기록은 실제 연동(REAL)으로 남는다', async () => {
      ctx.clock.set(NIGHT)
      const { client, user } = await guardian()
      await client.post('/api/push/subscribe', sub('alert-phone'))
      sender.sent = []
      await entranceAlert(user)
      expect(sender.sent).toHaveLength(1)
      expect(sender.sent[0]?.payload).toMatchObject({
        type: 'alert',
        severity: 'URGENT',
        title: '현관 근처에서 움직임이 감지되었습니다',
      })
      const rows = await deliveries(user.guardianId, 'WEB_PUSH')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ status: 'SENT', providerMode: 'REAL', attempts: 1 })
      expect(
        (await integrations(client)).find((i) => i.key === 'WEB_PUSH')?.lastSuccessAt,
      ).not.toBeNull()
    })

    it('푸시 내용에는 센서 ID 같은 내부 정보가 없다', async () => {
      ctx.clock.set(NIGHT)
      const { client, user } = await guardian()
      await client.post('/api/push/subscribe', sub('privacy-phone'))
      sender.sent = []
      await entranceAlert(user)
      expect(Object.keys(sender.sent[0]!.payload).sort()).toEqual([
        'alertId',
        'body',
        'severity',
        'title',
        'type',
      ])
    })

    it('기기가 하나도 없으면 전달 실패로 남는다 (보낸 척하지 않음)', async () => {
      ctx.clock.set(NIGHT)
      const { user } = await guardian()
      await entranceAlert(user)
      const rows = await deliveries(user.guardianId, 'WEB_PUSH')
      // 구독이 없는 것은 다시 보내도 같은 결과이므로 재시도 대기가 아니라 바로 실패로 확정한다.
      expect(rows[0]?.status).toBe('FAILED')
      expect(rows[0]?.attempts).toBe(1)
      expect(rows[0]?.lastError).toContain('등록한 기기가 없습니다')
    })

    it('기기 둘 중 하나만 받아도 전달됨이다', async () => {
      ctx.clock.set(NIGHT)
      const { client, user } = await guardian()
      await client.post('/api/push/subscribe', sub('good-device'))
      await client.post('/api/push/subscribe', sub('bad-device'))
      sender.failures.set('bad-device', 'error')
      try {
        await entranceAlert(user)
      } finally {
        sender.failures.clear()
      }
      expect((await deliveries(user.guardianId, 'WEB_PUSH'))[0]?.status).toBe('SENT')
    })

    it('시뮬레이션 알림은 앱 밖으로 나가는 푸시로 보내지 않는다', async () => {
      ctx.clock.set(NIGHT)
      const { client, user } = await guardian()
      await client.post('/api/push/subscribe', sub('sim-phone'))
      sender.sent = []
      await entranceAlert(user, 'SIMULATED')
      expect(sender.sent).toHaveLength(0)
      expect(await deliveries(user.guardianId, 'WEB_PUSH')).toHaveLength(0)
    })

    it('푸시가 실패해도 앱 화면 알림은 영향받지 않는다', async () => {
      ctx.clock.set(NIGHT)
      const { client, user } = await guardian()
      const screen = await openSocket(ctx.baseUrl, client)
      try {
        await entranceAlert(user)
        await screen.waitForCount('alert.notify', 1)
      } finally {
        screen.close()
      }
      expect((await deliveries(user.guardianId, 'IN_APP'))[0]?.status).toBe('SENT')
      ctx.clock.advance(MINUTE)
    })
  })
})
