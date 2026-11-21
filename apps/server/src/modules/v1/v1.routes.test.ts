/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiErrorBodySchema,
  DashboardSummaryResponseSchema,
  DashboardSummarySchema,
} from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { MINUTE, NIGHT, TestDevice } from '@/test-utils/scenario'

const contexts: TestContext[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const ctx of contexts.splice(0)) await ctx.close()
})

/**
 * 이 파일은 여러 응답의 JSON 을 가볍게 들여다보는 계약 테스트라 느슨한 JSON 타입을 쓴다.
 * (응답 형태 자체는 공유 스키마 테스트와 각 서비스 테스트가 엄격하게 검사한다.)
 */
type Json = Record<string, any>

/** 보호자 한 명(센서 3개, 움직임·알림 몇 건)과, 아무것도 공유하지 않는 다른 가구의 보호자 */
async function fixture() {
  const ctx = await createTestContext()
  contexts.push(ctx)
  ctx.clock.set(NIGHT)
  const user = await ctx.createHousehold()
  const client = await ctx.loginAs(user)
  const other = await ctx.loginAs(await ctx.createHousehold())

  const make = async (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE', name: string) => {
    const sensor = await ctx.createSensor(user.householdId, { zone, name })
    return { id: sensor.id, device: new TestDevice(ctx, sensor.token) }
  }
  const bed = await make('BED_SIDE', '침대 옆')
  const path = await make('PATH', '복도')
  const door = await make('ENTRANCE', '현관문')
  await bed.device.motion()
  await path.device.motion(2 * MINUTE)
  await door.device.motion(4 * MINUTE) // ENTRANCE_APPROACH 알림

  const json = async (res: Response): Promise<Json> => (await res.json()) as Json
  const get = async (path: string, who: TestClient = client) => who.get(`/api/v1${path}`)
  const send = (method: string, path: string, body?: unknown, who: TestClient = client) =>
    who.request(`/api/v1${path}`, { method, ...(body !== undefined ? { body } : {}) })
  const error = async (res: Response) => ApiErrorBodySchema.parse(await res.json()).error

  return { ctx, user, client, other, bed, path, door, json, get, send, error }
}

describe('공통: 응답 형식·인증·오류', () => {
  it('성공은 { data } 로, 목록은 { data, meta } 로 내려가고, 응답은 저장되지 않는다', async () => {
    const { get, json } = await fixture()
    const res = await get('/events?limit=2')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await json(res)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toEqual({ limit: 2, nextCursor: expect.any(String), hasMore: true })
    expect(body.error).toBeUndefined()
  })

  it('health 는 로그인 없이 볼 수 있다', async () => {
    const { ctx } = await fixture()
    const res = await new TestClient(ctx.baseUrl).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(((await res.json()) as Json).data).toMatchObject({ status: 'ok' })
  })

  it.each([
    ['GET', '/dashboard/summary'],
    ['GET', '/sensors'],
    ['POST', '/sensors'],
    ['GET', '/sensors/abc'],
    ['PATCH', '/sensors/abc'],
    ['DELETE', '/sensors/abc'],
    ['GET', '/events'],
    ['GET', '/events/summary'],
    ['GET', '/events/abc'],
    ['GET', '/notifications'],
    ['PATCH', '/notifications/abc/read'],
    ['POST', '/notifications/read-all'],
    ['GET', '/settings'],
    ['PATCH', '/settings'],
    ['GET', '/care-recipients'],
    ['POST', '/care-recipients'],
    ['PATCH', '/care-recipients/abc'],
  ])('로그인하지 않으면 401 이다: %s %s', async (method, path) => {
    const { ctx, error } = await fixture()
    const res = await new TestClient(ctx.baseUrl).request(`/api/v1${path}`, {
      method,
      ...(method === 'GET' || method === 'DELETE' ? {} : { body: {} }),
    })
    expect(res.status).toBe(401)
    expect((await error(res)).code).toBe('UNAUTHORIZED')
  })

  it('허용되지 않은 출처의 쓰기 요청은 403 이다', async () => {
    const { client } = await fixture()
    const res = await client.request('/api/v1/sensors', {
      method: 'POST',
      body: { name: 'x', zone: 'PATH' },
      headers: { Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })

  it('너무 큰 요청 본문은 413 이고, 잘못된 JSON 은 400 이다', async () => {
    const { client, error } = await fixture()
    const big = await client.request('/api/v1/care-recipients', {
      method: 'POST',
      body: { displayName: '가', notes: 'x'.repeat(200_000) },
    })
    expect(big.status).toBe(413)
    expect((await error(big)).message).toContain('너무 큽니다')

    const bad = await fetch(`${client.baseUrl}/api/v1/care-recipients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: client.cookie ?? '',
        Origin: 'http://localhost:5173',
      },
      body: '{"displayName": ',
    })
    expect(bad.status).toBe(400)
  })

  it('DB 오류는 500 이고 내부 정보를 그대로 내보내지 않는다', async () => {
    const { ctx, get } = await fixture()
    vi.spyOn(ctx.prisma.sensor, 'findMany').mockRejectedValue(
      new Error('SQLITE_BUSY: database is locked at /srv/secret/path/db.sqlite'),
    )
    const res = await get('/sensors')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toMatch(/SQLITE|secret|db\.sqlite|locked/)
    const body = ApiErrorBodySchema.parse(JSON.parse(text))
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.requestId).toBeTruthy()
  })

  it('입력 검증 오류는 어느 항목이 왜 잘못되었는지(details)를 알려 준다', async () => {
    const { send, error } = await fixture()
    const res = await send('POST', '/sensors', { name: '', zone: 'GARAGE' })
    expect(res.status).toBe(400)
    const body = await error(res)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.details?.map((d) => d.path).sort()).toEqual(['name', 'zone'])
  })
})

describe('GET /dashboard/summary', () => {
  it('한 번에 센서·최근 움직임·진행 중 알림·일정·주간 요약을 돌려준다', async () => {
    const { get, json } = await fixture()
    const res = await get('/dashboard/summary')
    expect(res.status).toBe(200)
    const body = await json(res)
    // 웹이 응답을 검증하는 스키마와 같은 것으로 확인한다. (서버·웹 계약)
    DashboardSummaryResponseSchema.parse(body)
    const data = DashboardSummarySchema.parse(body.data)
    expect(data.sensors).toHaveLength(3)
    expect(data.recentEvents.length).toBeGreaterThan(0)
    expect(data.activeAlerts.some((a) => a.type === 'ENTRANCE_APPROACH')).toBe(true)
    expect(data.weekly).toHaveLength(7)
    expect(data.schedule).toMatchObject({ monitoringEnabled: true, nightStart: '22:00' })
    // 읽음은 보호자별 값이라 요약의 알림에는 없다.
    expect(data.activeAlerts.every((a) => !('read' in a))).toBe(true)
  })

  it('다른 가구의 데이터는 섞이지 않는다', async () => {
    const { get, other, json } = await fixture()
    const data = (await json(await get('/dashboard/summary', other))).data
    expect(data.sensors).toEqual([])
    expect(data.activeAlerts).toEqual([])
    expect(data.recentEvents).toEqual([])
  })
})

describe('/sensors', () => {
  it('목록: 필터·정렬을 적용하고 meta.total 을 알린다', async () => {
    const { get, send, json, bed } = await fixture()
    await send('PATCH', `/sensors/${bed.id}`, { isActive: false })
    const byName = await json(await get('/sensors?sort=name&order=desc'))
    expect(byName.data.map((s: Json) => s.name)).toEqual(['현관문', '침대 옆', '복도'])
    expect(byName.meta).toEqual({ total: 3 })

    const zone = await json(await get('/sensors?zone=PATH'))
    expect(zone.data.map((s: Json) => s.name)).toEqual(['복도'])
    const disabled = await json(await get('/sensors?enabled=false'))
    expect(disabled.data.map((s: Json) => s.id)).toEqual([bed.id])
  })

  it('잘못된 필터·정렬 값은 400 이다', async () => {
    const { get } = await fixture()
    for (const query of ['zone=GARAGE', 'enabled=maybe', 'sort=password', 'order=sideways']) {
      expect((await get(`/sensors?${query}`)).status, query).toBe(400)
    }
  })

  it('등록하면 201 과 함께 장치 토큰을 한 번만 알려 주고, 보낸 가구 ID 는 무시한다', async () => {
    const { ctx, send, json, user } = await fixture()
    const stranger = await ctx.createHousehold()
    const res = await send('POST', '/sensors', {
      name: '새 센서',
      zone: 'ENTRANCE',
      deviceId: 'SN-1',
      householdId: stranger.householdId,
    })
    expect(res.status).toBe(201)
    const data = (await json(res)).data
    expect(data.deviceToken).toMatch(/^tsn_/)
    expect(data.sensor).toMatchObject({ name: '새 센서', deviceId: 'SN-1' })
    const row = await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: data.sensor.id } })
    expect(row.householdId).toBe(user.householdId)
  })

  it('조회·수정·삭제와 오류: 없는 센서 404, 이상한 ID 400, 사용 중인 센서 삭제 409', async () => {
    const { get, send, json, error, door } = await fixture()
    expect(((await json(await get(`/sensors/${door.id}`))).data as Json).id).toBe(door.id)

    const patched = await json(
      await send('PATCH', `/sensors/${door.id}`, { name: '현관 센서', sensitivity: 'HIGH' }),
    )
    expect(patched.data).toMatchObject({ name: '현관 센서', sensitivity: 'HIGH' })

    expect((await send('PATCH', `/sensors/${door.id}`, {})).status).toBe(400) // 바꿀 항목 없음
    expect((await get('/sensors/nonexistentid')).status).toBe(404)
    expect((await get('/sensors/has space')).status).toBe(400)
    expect((await get(`/sensors/${'a'.repeat(65)}`)).status).toBe(400)

    const active = await send('DELETE', `/sensors/${door.id}`)
    expect(active.status).toBe(409)
    expect((await error(active)).code).toBe('CONFLICT')
    await send('PATCH', `/sensors/${door.id}`, { isActive: false })
    const removed = await send('DELETE', `/sensors/${door.id}`)
    expect(removed.status).toBe(200)
    expect(((await json(removed)).data as Json).ok).toBe(true)
    expect((await get(`/sensors/${door.id}`)).status).toBe(404)
  })

  it('다른 가구의 센서는 존재하지 않는 것과 똑같이 404 이다 (조회·수정·삭제 모두)', async () => {
    const { send, get, other, bed } = await fixture()
    expect((await get(`/sensors/${bed.id}`, other)).status).toBe(404)
    expect((await send('PATCH', `/sensors/${bed.id}`, { name: '탈취' }, other)).status).toBe(404)
    expect((await send('DELETE', `/sensors/${bed.id}`, undefined, other)).status).toBe(404)
    expect(((await (await get(`/sensors/${bed.id}`)).json()) as Json).data.name).toBe('침대 옆')
  })
})

describe('/events', () => {
  it('페이지를 이어 받으면 빠짐·중복 없이 모든 기록을 얻고, 정렬 방향을 바꿀 수 있다', async () => {
    const { get, json } = await fixture()
    const collect = async (order: 'asc' | 'desc') => {
      const ids: string[] = []
      const times: string[] = []
      let cursor: string | null = null
      for (let guard = 0; guard < 10; guard += 1) {
        const body: Json = await json(
          await get(`/events?limit=2&order=${order}${cursor ? `&cursor=${cursor}` : ''}`),
        )
        for (const event of body.data as Json[]) {
          ids.push(event.id)
          times.push(event.occurredAt)
        }
        cursor = body.meta.nextCursor
        if (!body.meta.hasMore) break
      }
      return { ids, times }
    }
    const desc = await collect('desc')
    const asc = await collect('asc')
    expect(desc.ids).toHaveLength(3)
    expect(new Set(desc.ids).size).toBe(3)
    expect([...desc.ids].reverse()).toEqual(asc.ids)
    expect(desc.times).toEqual([...desc.times].sort().reverse())
    expect(asc.times).toEqual([...asc.times].sort())
  })

  it('구역·센서·날짜 범위로 거른다', async () => {
    const { get, json, door } = await fixture()
    const zone = await json(await get('/events?zone=ENTRANCE'))
    expect(zone.data).toHaveLength(1)
    const sensor = await json(await get(`/events?sensorId=${door.id}`))
    expect(sensor.data.map((e: Json) => e.sensorId)).toEqual([door.id])
    const future = await json(await get('/events?from=2030-01-01T00:00:00Z'))
    expect(future.data).toEqual([])
    const all = await json(await get('/events?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z'))
    expect(all.data).toHaveLength(3)
  })

  it.each([
    ['시작이 종료보다 늦다', 'from=2026-12-01T00:00:00Z&to=2026-11-01T00:00:00Z'],
    ['날짜 형식이 아니다', 'from=yesterday'],
    ['limit 이 0', 'limit=0'],
    ['limit 이 너무 큼', 'limit=100000'],
    ['limit 이 숫자가 아님', 'limit=abc'],
    ['알 수 없는 구역', 'zone=ROOF'],
    ['알 수 없는 정렬', 'order=random'],
  ])('잘못된 쿼리는 400: %s', async (_name, query) => {
    const { get, error } = await fixture()
    const res = await get(`/events?${query}`)
    expect(res.status).toBe(400)
    expect((await error(res)).code).toBe('VALIDATION_ERROR')
  })

  it('한 건 조회: 있으면 200, 없으면 404, 이상한 ID 는 400, 다른 가구의 것은 404', async () => {
    const { get, other, json } = await fixture()
    const list = await json(await get('/events?limit=1'))
    const id = list.data[0].id as string
    expect(((await json(await get(`/events/${id}`))).data as Json).id).toBe(id)
    expect((await get('/events/doesnotexist')).status).toBe(404)
    expect((await get('/events/bad%20id')).status).toBe(400)
    expect((await get(`/events/${id}`, other)).status).toBe(404)
  })

  it('요약: 날짜별 집계와 합계를 돌려주고, days 범위를 검사한다', async () => {
    const { get, json } = await fixture()
    const body = (await json(await get('/events/summary?days=3'))).data as Json
    expect(body.days).toHaveLength(3)
    expect(body.totals.movements).toBe(3)
    expect(body.totals.attentionAlerts).toBeGreaterThanOrEqual(1)
    expect((await get('/events/summary?days=0')).status).toBe(400)
    expect((await get('/events/summary?days=99')).status).toBe(400)
  })
})

describe('/notifications', () => {
  it('목록은 보호자별 읽음 여부를 포함하고, 읽지 않음·중요 필터와 페이지를 지원한다', async () => {
    const { get, json } = await fixture()
    const all = await json(await get('/notifications?limit=1'))
    expect(all.data).toHaveLength(1)
    expect(all.meta).toMatchObject({ limit: 1, hasMore: all.meta.nextCursor !== null })
    expect(all.meta.hasMore).toBe(true) // 알림이 둘 이상 있다
    expect(all.data[0]).toMatchObject({ read: false, type: 'ENTRANCE_APPROACH' })
    expect((await json(await get('/notifications?unread=true'))).data.length).toBeGreaterThan(0)
    expect((await json(await get('/notifications?important=true'))).data.length).toBeGreaterThan(0)
    expect((await get('/notifications?unread=false')).status).toBe(400)
    expect((await get('/notifications?limit=0')).status).toBe(400)
  })

  it('읽음 표시는 알림의 처리 상태를 바꾸지 않고, 여러 번 해도 같다', async () => {
    const { get, send, json } = await fixture()
    const alert = (await json(await get('/notifications'))).data[0] as Json
    const first = await send('PATCH', `/notifications/${alert.id}/read`)
    expect(first.status).toBe(200)
    const read = (await json(first)).data as Json
    expect(read).toMatchObject({ id: alert.id, read: true, status: 'OPEN' })
    const again = await send('PATCH', `/notifications/${alert.id}/read`)
    expect(((await json(again)).data as Json).read).toBe(true)
    expect(
      (await json(await get('/notifications?unread=true'))).data.map((a: Json) => a.id),
    ).not.toContain(alert.id)
  })

  it('모두 읽음은 읽지 않은 알림 수만큼 갱신한다', async () => {
    const { get, send, json } = await fixture()
    const before = (await json(await get('/notifications?unread=true'))).data.length as number
    const res = await send('POST', '/notifications/read-all')
    expect(res.status).toBe(200)
    expect(((await json(res)).data as Json).updated).toBe(before)
    expect((await json(await get('/notifications?unread=true'))).data).toEqual([])
  })

  it('없는 알림은 404, 이상한 ID 는 400, 다른 가구의 알림은 404 이고 읽음 표시도 되지 않는다', async () => {
    const { get, send, other, json } = await fixture()
    const alert = (await json(await get('/notifications'))).data[0] as Json
    expect((await send('PATCH', '/notifications/nope/read')).status).toBe(404)
    expect((await send('PATCH', '/notifications/bad%20id/read')).status).toBe(400)
    expect((await send('PATCH', `/notifications/${alert.id}/read`, undefined, other)).status).toBe(
      404,
    )
    expect(((await json(await get('/notifications'))).data[0] as Json).read).toBe(false)
  })
})

describe('/settings', () => {
  it('조회: 감지 설정·받을 알림·고정 시간대를 함께 돌려준다', async () => {
    const { get, json } = await fixture()
    const data = (await json(await get('/settings'))).data as Json
    expect(data.timezone).toBe('Asia/Seoul')
    expect(data.detection).toMatchObject({
      monitoringEnabled: true,
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      sensitivity: 'MEDIUM',
    })
    expect(data.alerts).toMatchObject({ entranceApproach: true, lowBattery: true })
  })

  it('일부 항목만 바꾸면 나머지는 그대로 두고 저장한다', async () => {
    const { get, send, json } = await fixture()
    const res = await send('PATCH', '/settings', {
      detection: { activeWeekdays: [0, 2, 4], sensitivity: 'HIGH' },
      alerts: { lowBattery: false },
    })
    expect(res.status).toBe(200)
    const data = (await json(res)).data as Json
    expect(data.detection).toMatchObject({
      activeWeekdays: [0, 2, 4],
      sensitivity: 'HIGH',
      nightStart: '22:00',
    })
    expect(data.alerts).toMatchObject({ lowBattery: false, entranceApproach: true })
    expect(((await json(await get('/settings'))).data as Json).detection.sensitivity).toBe('HIGH')
  })

  it('저장한 설정은 다음 신호의 처리에 실제로 반영된다', async () => {
    const { send, get, json, door } = await fixture()
    await send('PATCH', '/settings', { detection: { monitoringEnabled: false } })
    const before = (await json(await get('/notifications?limit=100'))).data.length as number
    await door.device.motion(30 * MINUTE)
    expect((await json(await get('/notifications?limit=100'))).data.length).toBe(before)
  })

  it.each([
    ['빈 요청', {}],
    ['알 수 없는 묶음', { monitoring: { enabled: true } }],
    ['알 수 없는 항목', { detection: { nightColor: 'blue' } }],
    ['형식이 틀린 시각', { detection: { nightStart: '25:00' } }],
    ['범위 밖 숫자', { detection: { cooldownMinutes: 9999 } }],
    ['알 수 없는 민감도', { detection: { sensitivity: 'EXTREME' } }],
    ['요일 없이 모니터링 켬', { detection: { activeWeekdays: [] } }],
    ['요일 범위 밖', { detection: { activeWeekdays: [7] } }],
    ['불리언이 아님', { alerts: { lowBattery: 'no' } }],
  ])('잘못된 요청은 400 이고 아무것도 저장하지 않는다: %s', async (_name, body) => {
    const { get, send, json } = await fixture()
    const before = await json(await get('/settings'))
    const res = await send('PATCH', '/settings', body)
    expect(res.status).toBe(400)
    expect(await json(await get('/settings'))).toEqual(before)
  })

  it('두 묶음 중 하나가 잘못되면 둘 다 저장하지 않는다 (알림 설정도 그대로)', async () => {
    const { get, send, json } = await fixture()
    const res = await send('PATCH', '/settings', {
      alerts: { entranceApproach: false },
      detection: { nightStart: '99:99' },
    })
    expect(res.status).toBe(400)
    expect(((await json(await get('/settings'))).data as Json).alerts.entranceApproach).toBe(true)
  })

  it('다른 가구의 설정은 바뀌지 않는다', async () => {
    const { send, get, other, json } = await fixture()
    await send('PATCH', '/settings', { detection: { sensitivity: 'LOW' } })
    expect(((await json(await get('/settings', other))).data as Json).detection.sensitivity).toBe(
      'MEDIUM',
    )
  })
})

describe('/care-recipients', () => {
  it('목록: 가구의 보호 대상(별칭)을 돌려준다', async () => {
    const { get, json } = await fixture()
    const body = await json(await get('/care-recipients'))
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ displayName: '어르신(테스트)', notes: null })
    expect(body.meta).toEqual({ total: 1 })
  })

  it('이미 있으면 등록은 409 이다 (가구마다 한 명)', async () => {
    const { send, error } = await fixture()
    const res = await send('POST', '/care-recipients', { displayName: '또 한 명' })
    expect(res.status).toBe(409)
    expect((await error(res)).message).toContain('한 명만')
  })

  it('없으면 별칭만으로 등록하고(201), 메모는 선택이다', async () => {
    const { ctx, user, send, json } = await fixture()
    await ctx.prisma.careRecipient.delete({ where: { householdId: user.householdId } })
    const res = await send('POST', '/care-recipients', { displayName: '  할머니  ', notes: '' })
    expect(res.status).toBe(201)
    expect((await json(res)).data).toMatchObject({ displayName: '할머니', notes: null })
  })

  it('수정: 별칭·메모를 바꾸고, null 이나 빈 문자열이면 메모를 지운다', async () => {
    const { send, json, get } = await fixture()
    const id = ((await json(await get('/care-recipients'))).data[0] as Json).id as string
    const first = await json(
      await send('PATCH', `/care-recipients/${id}`, {
        displayName: '엄마',
        notes: '밤에 자주 깨심',
      }),
    )
    expect(first.data).toMatchObject({ displayName: '엄마', notes: '밤에 자주 깨심' })
    expect(new Date(first.data.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.data.createdAt).getTime(),
    )
    const cleared = await json(await send('PATCH', `/care-recipients/${id}`, { notes: null }))
    expect(cleared.data).toMatchObject({ displayName: '엄마', notes: null })
  })

  it.each([
    ['빈 별칭', { displayName: '   ' }],
    ['21자 별칭', { displayName: 'x'.repeat(21) }],
    ['201자 메모', { notes: 'x'.repeat(201) }],
    ['바꿀 항목 없음', {}],
    ['진단 정보 같은 알 수 없는 항목', { diagnosis: '치매' }],
  ])('잘못된 요청은 400: %s', async (_name, body) => {
    const { send, json, get } = await fixture()
    const id = ((await json(await get('/care-recipients'))).data[0] as Json).id as string
    const res = await send('PATCH', `/care-recipients/${id}`, body)
    expect(res.status).toBe(400)
  })

  it('다른 가구의 보호 대상은 404 이고 바뀌지 않는다', async () => {
    const { send, json, get, other } = await fixture()
    const id = ((await json(await get('/care-recipients'))).data[0] as Json).id as string
    expect(
      (await send('PATCH', `/care-recipients/${id}`, { displayName: '탈취' }, other)).status,
    ).toBe(404)
    expect(((await json(await get('/care-recipients'))).data[0] as Json).displayName).toBe(
      '어르신(테스트)',
    )
    expect((await send('PATCH', '/care-recipients/nope', { displayName: 'x' })).status).toBe(404)
    expect((await send('PATCH', '/care-recipients/a%20b', { displayName: 'x' })).status).toBe(400)
  })
})
