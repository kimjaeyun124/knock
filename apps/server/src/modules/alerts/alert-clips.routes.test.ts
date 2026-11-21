import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ALERT_CLIP_LIMITS,
  AlertClipUploadResponseSchema,
  AlertClipsResponseSchema,
} from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient, WEB_ORIGIN } from '@/test-utils/http'

const DAY = 24 * 60 * 60 * 1000

describe('알림 영상 (시연용 웹캠)', () => {
  let ctx: TestContext
  let me: TestHousehold
  let other: TestHousehold
  let client: TestClient

  beforeAll(async () => {
    ctx = await createTestContext({ simulator: true })
    me = await ctx.createHousehold()
    other = await ctx.createHousehold()
    client = await ctx.loginAs(me)
  })
  afterAll(async () => {
    await ctx.close()
  })

  let seq = 0
  async function makeAlert(householdId: string, origin: 'SIMULATED' | 'REAL' = 'SIMULATED') {
    seq += 1
    const alert = await ctx.prisma.alert.create({
      data: {
        householdId,
        type: 'ENTRANCE_APPROACH',
        severity: 'URGENT',
        origin,
        title: '현관 근처에서 움직임이 감지되었습니다',
        message: '확인해 주세요.',
        triggeredAt: ctx.clock.now(),
        dedupeKey: `test-${seq}`,
      },
    })
    return alert.id
  }

  /** 영상 본문을 그대로 보낸다. (TestClient 는 JSON 만 보내므로 fetch 를 직접 쓴다) */
  function upload(
    as: TestClient,
    alertId: string,
    body: Uint8Array,
    contentType = 'video/webm',
    query = '?durationMs=4000',
  ) {
    return fetch(`${ctx.baseUrl}/api/dev/simulator/alerts/${alertId}/clips${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        Origin: WEB_ORIGIN,
        ...(as.cookie ? { Cookie: as.cookie } : {}),
      },
      body,
    })
  }
  const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

  it('시뮬레이션 알림에 영상을 붙이면 목록에 나오고, 같은 내용을 그대로 돌려준다 (저장·전송 안 됨 헤더)', async () => {
    const alertId = await makeAlert(me.householdId)
    const res = await upload(client, alertId, bytes(1234))
    expect(res.status).toBe(201)
    const { clip } = AlertClipUploadResponseSchema.parse(await res.json())
    expect(clip).toMatchObject({
      alertId,
      mimeType: 'video/webm',
      sizeBytes: 1234,
      durationMs: 4000,
    })

    const list = AlertClipsResponseSchema.parse(
      await (await client.get(`/api/alerts/${alertId}/clips`)).json(),
    )
    expect(list.clips.map((c) => c.id)).toEqual([clip.id])

    const video = await client.get(clip.url)
    expect(video.status).toBe(200)
    expect(video.headers.get('content-type')).toBe('video/webm')
    expect(video.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await video.arrayBuffer())).toEqual(bytes(1234))
  })

  it('영상을 조각(Range)으로 요청하면 206 과 그 부분만 돌려준다 (아이폰 재생에 필요)', async () => {
    const alertId = await makeAlert(me.householdId)
    const body = Uint8Array.from({ length: 100 }, (_, i) => i)
    const { clip } = AlertClipUploadResponseSchema.parse(
      await (await upload(client, alertId, body, 'video/mp4')).json(),
    )
    const first = await client.get(clip.url, { Range: 'bytes=0-1' })
    expect(first.status).toBe(206)
    expect(first.headers.get('content-range')).toBe('bytes 0-1/100')
    expect(first.headers.get('accept-ranges')).toBe('bytes')
    expect(Array.from(new Uint8Array(await first.arrayBuffer()))).toEqual([0, 1])

    const tail = await client.get(clip.url, { Range: 'bytes=-3' })
    expect(Array.from(new Uint8Array(await tail.arrayBuffer()))).toEqual([97, 98, 99])
    const open = await client.get(clip.url, { Range: 'bytes=98-' })
    expect(Array.from(new Uint8Array(await open.arrayBuffer()))).toEqual([98, 99])

    const outside = await client.get(clip.url, { Range: 'bytes=500-600' })
    expect(outside.status).toBe(416)
    expect(outside.headers.get('content-range')).toBe('bytes */100')

    const whole = await client.get(clip.url)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('accept-ranges')).toBe('bytes')
  })

  it('codecs 같은 매개변수가 붙은 형식도 받는다', async () => {
    const alertId = await makeAlert(me.householdId)
    const res = await upload(client, alertId, bytes(10), 'video/webm;codecs=vp8')
    expect(res.status).toBe(201)
  })

  it('다른 가구의 알림은 "없는 것"과 같은 404 다 (올리기·목록·재생 모두)', async () => {
    const theirs = await makeAlert(other.householdId)
    expect((await upload(client, theirs, bytes(10))).status).toBe(404)
    expect((await client.get(`/api/alerts/${theirs}/clips`)).status).toBe(404)

    const otherClient = await ctx.loginAs(other)
    const res = await upload(otherClient, theirs, bytes(10))
    const { clip } = AlertClipUploadResponseSchema.parse(await res.json())
    expect((await client.get(clip.url)).status).toBe(404)
  })

  it('로그인하지 않으면 401 이다', async () => {
    const alertId = await makeAlert(me.householdId)
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await upload(anonymous, alertId, bytes(10))).status).toBe(401)
    expect((await anonymous.get(`/api/alerts/${alertId}/clips`)).status).toBe(401)
  })

  it('실제 센서 알림에는 붙이지 않는다 (영상은 시연용 웹캠에서만 온다)', async () => {
    const real = await makeAlert(me.householdId, 'REAL')
    expect((await upload(client, real, bytes(10))).status).toBe(409)
  })

  it('영상이 아닌 형식은 415, 빈 본문은 400, 너무 크면 413 이다', async () => {
    const alertId = await makeAlert(me.householdId)
    expect((await upload(client, alertId, bytes(10), 'image/png')).status).toBe(415)
    expect((await upload(client, alertId, bytes(0))).status).toBe(400)
    expect((await upload(client, alertId, bytes(ALERT_CLIP_LIMITS.maxBytes + 1))).status).toBe(413)
    const list = AlertClipsResponseSchema.parse(
      await (await client.get(`/api/alerts/${alertId}/clips`)).json(),
    )
    expect(list.clips).toEqual([])
  })

  it(`알림 하나에는 ${ALERT_CLIP_LIMITS.maxPerAlert}개까지만 붙는다`, async () => {
    const alertId = await makeAlert(me.householdId)
    for (let i = 0; i < ALERT_CLIP_LIMITS.maxPerAlert; i += 1) {
      expect((await upload(client, alertId, bytes(10))).status).toBe(201)
    }
    expect((await upload(client, alertId, bytes(10))).status).toBe(409)
  })

  it('녹화 길이가 이상하면 저장은 하되 길이는 비운다', async () => {
    const alertId = await makeAlert(me.householdId)
    const res = await upload(client, alertId, bytes(10), 'video/webm', '?durationMs=-5')
    const { clip } = AlertClipUploadResponseSchema.parse(await res.json())
    expect(clip.durationMs).toBeNull()
  })

  it(`보관 기간(${ALERT_CLIP_LIMITS.retentionDays}일)이 지나면 주기 정리에서 지워진다`, async () => {
    const alertId = await makeAlert(me.householdId)
    await upload(client, alertId, bytes(10))
    ctx.clock.advance((ALERT_CLIP_LIMITS.retentionDays - 1) * DAY)
    await ctx.services.clips.purgeExpired()
    expect(
      AlertClipsResponseSchema.parse(
        await (await client.get(`/api/alerts/${alertId}/clips`)).json(),
      ).clips,
    ).toHaveLength(1)
    ctx.clock.advance(2 * DAY)
    expect(await ctx.services.clips.purgeExpired()).toBeGreaterThanOrEqual(1)
    expect(
      AlertClipsResponseSchema.parse(
        await (await client.get(`/api/alerts/${alertId}/clips`)).json(),
      ).clips,
    ).toHaveLength(0)
  })

  it('시뮬레이션 데이터를 지우면 알림과 함께 영상도 지워진다', async () => {
    const alertId = await makeAlert(me.householdId)
    await upload(client, alertId, bytes(10))
    expect((await client.delete('/api/data/simulated')).status).toBe(200)
    expect(await ctx.prisma.alertClip.count({ where: { alertId } })).toBe(0)
  })
})

describe('알림 영상 — 시뮬레이터가 꺼진 서버', () => {
  it('영상을 올리는 경로 자체가 없다 (404)', async () => {
    const ctx = await createTestContext()
    try {
      const me = await ctx.createHousehold()
      const client = await ctx.loginAs(me)
      const res = await fetch(`${ctx.baseUrl}/api/dev/simulator/alerts/x/clips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'video/webm',
          Origin: WEB_ORIGIN,
          ...(client.cookie ? { Cookie: client.cookie } : {}),
        },
        body: new Uint8Array(10),
      })
      expect(res.status).toBe(404)
    } finally {
      await ctx.close()
    }
  })
})
