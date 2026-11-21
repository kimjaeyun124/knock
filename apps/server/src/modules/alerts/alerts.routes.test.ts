import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AlertDetailSchema,
  AlertListResponseSchema,
  AlertResponseSchema,
  ApiErrorBodySchema,
} from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice } from '@/test-utils/scenario'

describe('알림 API', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold
  let clientA: TestClient
  let clientB: TestClient
  let door: TestDevice
  let bed: TestDevice
  let path: TestDevice
  let ids: { entrance: string; flow: string }

  beforeAll(async () => {
    ctx = await createTestContext()
    ctx.clock.set(NIGHT)
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
    clientA = await ctx.loginAs(a)
    clientB = await ctx.loginAs(b)
    const make = async (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE', name: string) =>
      new TestDevice(ctx, (await ctx.createSensor(a.householdId, { zone, name })).token)
    bed = await make('BED_SIDE', '침대 옆')
    path = await make('PATH', '복도')
    door = await make('ENTRANCE', '현관문')

    await bed.motion()
    await path.motion(2 * MINUTE) // BED_TO_PATH
    await door.motion(3 * MINUTE) // ENTRANCE_APPROACH
    const list = await listAlerts()
    ids = {
      entrance: list.find((x) => x.type === 'ENTRANCE_APPROACH')!.id,
      flow: list.find((x) => x.type === 'BED_TO_PATH')!.id,
    }
  })
  afterAll(async () => {
    await ctx.close()
  })

  const listAlerts = async (query = '', client = clientA) =>
    AlertListResponseSchema.parse(await (await client.get(`/api/alerts${query}`)).json()).alerts
  const errorOf = async (res: Response) => ApiErrorBodySchema.parse(await res.json()).error

  it('로그인하지 않으면 모든 엔드포인트가 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/alerts')).status).toBe(401)
    expect((await anonymous.get(`/api/alerts/${ids.entrance}`)).status).toBe(401)
    expect((await anonymous.post(`/api/alerts/${ids.entrance}/acknowledge`)).status).toBe(401)
    expect(
      (await anonymous.post(`/api/alerts/${ids.entrance}/resolve`, { resolution: 'CHECKED' }))
        .status,
    ).toBe(401)
  })

  describe('목록', () => {
    it('최신 알림부터 보여 주고 전달 요약을 함께 담는다', async () => {
      const list = await listAlerts()
      expect(list).toHaveLength(2)
      for (const alert of list) {
        expect(alert.delivery.notConfigured).toBe(4) // 푸시·스마트워치·문자·카카오 모두 연동되지 않음
        expect(alert.sensorName).not.toBeNull()
      }
      // 발생 시각이 늦은 순
      const times = list.map((x) => Date.parse(x.triggeredAt))
      expect(times).toEqual([...times].sort((x, y) => y - x))
    })

    it('상태·종류로 거를 수 있고, 상태는 쉼표로 여러 개를 줄 수 있다', async () => {
      expect(await listAlerts('?type=ENTRANCE_APPROACH')).toHaveLength(1)
      expect(await listAlerts('?status=OPEN')).toHaveLength(2)
      expect(await listAlerts('?status=OPEN,ACKNOWLEDGED')).toHaveLength(2)
      expect(await listAlerts('?status=RESOLVED')).toHaveLength(0)
      expect(await listAlerts('?origin=SIMULATED')).toHaveLength(0)
    })

    it('limit 와 nextCursor 로 빠짐·중복 없이 이어 읽을 수 있다', async () => {
      const first = AlertListResponseSchema.parse(
        await (await clientA.get('/api/alerts?limit=1')).json(),
      )
      expect(first.alerts).toHaveLength(1)
      expect(first.nextCursor).toBeTruthy()
      const second = AlertListResponseSchema.parse(
        await (await clientA.get(`/api/alerts?limit=1&cursor=${first.nextCursor}`)).json(),
      )
      expect(second.alerts).toHaveLength(1)
      expect(second.nextCursor).toBeNull()
      expect(second.alerts[0]?.id).not.toBe(first.alerts[0]?.id)
    })

    it.each([
      ['알 수 없는 상태', '?status=DONE'],
      ['빈 상태 목록', '?status='],
      ['알 수 없는 종류', '?type=FALL'],
      ['limit 0', '?limit=0'],
      ['limit 101', '?limit=101'],
      ['깨진 cursor', '?cursor=%%%'],
    ])('잘못된 조건은 400: %s', async (_name, query) => {
      expect((await clientA.get(`/api/alerts${query}`)).status).toBe(400)
    })

    it('다른 가구의 알림은 보이지 않는다', async () => {
      expect(await listAlerts('', clientB)).toEqual([])
    })
  })

  describe('상세', () => {
    it('근거 신호(오래된 순)와 전달 기록을 담는다', async () => {
      const detail = AlertDetailSchema.parse(
        await (await clientA.get(`/api/alerts/${ids.flow}`)).json(),
      )
      expect(detail.evidence.map((e) => e.zone)).toEqual(['BED_SIDE', 'PATH'])
      expect(detail.deliveries.map((d) => d.channel).sort()).toEqual([
        'IN_APP',
        'KAKAO',
        'SMS',
        'WATCH',
        'WEB_PUSH',
      ])
    })

    it('다른 가구의 알림이나 없는 알림은 똑같이 404 이다', async () => {
      for (const id of [ids.entrance, 'no-such-alert']) {
        const res = await clientB.get(`/api/alerts/${id}`)
        expect(res.status).toBe(404)
        expect((await errorOf(res)).message).toBe('알림을 찾을 수 없습니다.')
      }
    })
  })

  describe('확인과 종료', () => {
    it('확인하면 누가 언제 확인했는지 남고, 다시 확인해도 같은 결과다 (멱등)', async () => {
      const res = await clientA.post(`/api/alerts/${ids.flow}/acknowledge`)
      expect(res.status).toBe(200)
      const alert = AlertResponseSchema.parse(await res.json()).alert
      expect(alert).toMatchObject({ status: 'ACKNOWLEDGED', acknowledgedByName: '테스트 보호자' })
      expect(alert.acknowledgedAt).toBeTruthy()

      const again = AlertResponseSchema.parse(
        await (await clientA.post(`/api/alerts/${ids.flow}/acknowledge`)).json(),
      ).alert
      expect(again.acknowledgedAt).toBe(alert.acknowledgedAt)
    })

    it('종료할 때 결과(확인함/잘못된 알림)와 메모를 남긴다', async () => {
      const res = await clientA.post(`/api/alerts/${ids.entrance}/resolve`, {
        resolution: 'FALSE_ALARM',
        note: '  화장실에 다녀오신 것  ',
      })
      expect(res.status).toBe(200)
      const alert = AlertResponseSchema.parse(await res.json()).alert
      expect(alert).toMatchObject({
        status: 'RESOLVED',
        resolution: 'FALSE_ALARM',
        note: '화장실에 다녀오신 것',
        acknowledgedByName: '테스트 보호자', // 바로 종료해도 확인한 사람이 남는다
      })
      expect(alert.resolvedAt).toBeTruthy()
    })

    it('이미 종료된 알림은 다시 확인하거나 종료할 수 없다 (409)', async () => {
      for (const res of [
        await clientA.post(`/api/alerts/${ids.entrance}/acknowledge`),
        await clientA.post(`/api/alerts/${ids.entrance}/resolve`, { resolution: 'CHECKED' }),
      ]) {
        expect(res.status).toBe(409)
        expect((await errorOf(res)).code).toBe('CONFLICT')
      }
    })

    it('종료 결과로 AUTO_RESOLVED 를 직접 보낼 수 없고, 메모는 500자까지다', async () => {
      const { id } = await freshAlert()
      for (const body of [
        { resolution: 'AUTO_RESOLVED' },
        { resolution: 'DONE' },
        {},
        { resolution: 'CHECKED', note: 'x'.repeat(501) },
      ]) {
        const res = await clientA.post(`/api/alerts/${id}/resolve`, body)
        expect(res.status, JSON.stringify(body)).toBe(400)
      }
      expect(
        (
          await clientA.post(`/api/alerts/${id}/resolve`, {
            resolution: 'CHECKED',
            note: 'x'.repeat(500),
          })
        ).status,
      ).toBe(200)
    })

    it('다른 가구의 알림은 확인·종료할 수 없고 내용도 바뀌지 않는다', async () => {
      const { id } = await freshAlert()
      expect((await clientB.post(`/api/alerts/${id}/acknowledge`)).status).toBe(404)
      expect(
        (await clientB.post(`/api/alerts/${id}/resolve`, { resolution: 'CHECKED' })).status,
      ).toBe(404)
      const row = await ctx.prisma.alert.findUniqueOrThrow({ where: { id } })
      expect(row.status).toBe('OPEN')
    })

    it('허용되지 않은 출처의 요청은 403 이다', async () => {
      const { id } = await freshAlert()
      const res = await clientA.post(`/api/alerts/${id}/acknowledge`, undefined, {
        Origin: 'https://evil.example',
      })
      expect(res.status).toBe(403)
    })

    /** 이미 종료된 알림과 겹치지 않도록 시간이 충분히 지난 뒤 새 현관 알림을 만든다. */
    async function freshAlert() {
      ctx.clock.advance(30 * MINUTE)
      await door.motion()
      const open = await listAlerts('?status=OPEN&type=ENTRANCE_APPROACH')
      return { id: open[0]!.id }
    }
  })
})
