import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  FORBIDDEN_PHRASES,
  TimelineDetailResponseSchema,
  TimelineResponseSchema,
  TimelineSummaryResponseSchema,
  type TimelineEvent,
} from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

const T0 = Date.parse('2026-11-14T00:00:00.000Z')
const at = (minutes: number) => new Date(T0 + minutes * 60_000)
const iso = (minutes: number) => at(minutes).toISOString()

describe('움직임 기록(타임라인) API', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold
  let client: TestClient
  let bed: { id: string }
  let path: { id: string }
  let door: { id: string }
  const alertIds: Record<string, string> = {}
  const eventIds: Record<string, string> = {}
  const statusIds: Record<string, string> = {}
  let n = 0

  const addEvent = async (
    key: string,
    sensor: { id: string },
    zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE',
    minutes: number,
    extra: {
      origin?: 'REAL' | 'SIMULATED'
      isLate?: boolean
      household?: TestHousehold
      eventClass?: 'BED_EXIT_CANDIDATE' | 'ENTRANCE_ACTIVITY' | 'MOTION_DETECTED'
    } = {},
  ) => {
    const row = await ctx.prisma.movementEvent.create({
      data: {
        householdId: (extra.household ?? a).householdId,
        sensorId: sensor.id,
        zone,
        origin: extra.origin ?? 'REAL',
        deviceEventId: `tl-evt-${String(++n).padStart(4, '0')}`,
        occurredAt: at(minutes),
        receivedAt: at(minutes + (extra.isLate ? 5 : 0)),
        isLate: extra.isLate ?? false,
        // 유형은 신호를 받을 때 판단 엔진이 정해 저장한 값이다. (이 테스트는 직접 넣으므로 구역에서 정한다)
        eventClass:
          extra.eventClass ?? (zone === 'ENTRANCE' ? 'ENTRANCE_ACTIVITY' : 'MOTION_DETECTED'),
      },
    })
    eventIds[key] = row.id
  }
  const addAlert = async (
    key: string,
    type:
      | 'BED_AREA_ACTIVITY'
      | 'BED_TO_PATH'
      | 'ENTRANCE_APPROACH'
      | 'REPEATED_MOVEMENT'
      | 'SENSOR_OFFLINE'
      | 'LOW_BATTERY',
    severity: 'INFO' | 'NOTICE' | 'URGENT',
    minutes: number,
    evidence: string[] = [],
    sensorId: string | null = null,
  ) => {
    const row = await ctx.prisma.alert.create({
      data: {
        householdId: a.householdId,
        type,
        severity,
        origin: 'REAL',
        title: '테스트 알림',
        message: '테스트',
        sensorId,
        triggeredAt: at(minutes),
        dedupeKey: `tl-alert-${++n}`,
        evidence: { create: evidence.map((k) => ({ eventId: eventIds[k]! })) },
      },
    })
    alertIds[key] = row.id
  }
  const addStatus = async (
    key: string,
    sensor: { id: string },
    kind: 'CONNECTED' | 'DISCONNECTED' | 'BATTERY_LOW' | 'BATTERY_CRITICAL' | 'BATTERY_OK',
    minutes: number,
    detail: string | null = null,
  ) => {
    const row = await ctx.prisma.sensorStatusLog.create({
      data: { sensorId: sensor.id, kind, at: at(minutes), detail },
    })
    statusIds[key] = row.id
  }

  beforeAll(async () => {
    ctx = await createTestContext()
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
    client = await ctx.loginAs(a)
    bed = await ctx.createSensor(a.householdId, { name: '침대 옆', zone: 'BED_SIDE' })
    path = await ctx.createSensor(a.householdId, { name: '복도', zone: 'PATH' })
    door = await ctx.createSensor(a.householdId, { name: '현관문', zone: 'ENTRANCE' })

    // 움직임 신호 (분 단위 시각)
    await addEvent('bed10', bed, 'BED_SIDE', 10, { eventClass: 'BED_EXIT_CANDIDATE' }) // 침대→경로 규칙의 근거
    await addEvent('path12', path, 'PATH', 12) // 같은 규칙의 근거
    await addEvent('door15', door, 'ENTRANCE', 15) // 현관 규칙의 근거 (긴급)
    await addEvent('bed20', bed, 'BED_SIDE', 20) // 알림 없음
    await addEvent('path30', path, 'PATH', 30, { origin: 'SIMULATED' }) // 알림 없음
    await addEvent('door35', door, 'ENTRANCE', 35) // 알림 없음
    await addEvent('bed40', bed, 'BED_SIDE', 40, { isLate: true, eventClass: 'BED_EXIT_CANDIDATE' }) // 알림 두 개의 근거 (주의 + 긴급)
    await addEvent('other', door, 'ENTRANCE', 45, { household: b })
    await addAlert('bedToPath', 'BED_TO_PATH', 'NOTICE', 12, ['bed10', 'path12'])
    await addAlert('entrance', 'ENTRANCE_APPROACH', 'URGENT', 15, ['door15'])
    await addAlert('bedArea', 'BED_AREA_ACTIVITY', 'NOTICE', 40, ['bed40'])
    await addAlert('repeated', 'REPEATED_MOVEMENT', 'URGENT', 40, ['bed40'])

    // 센서 상태 변화
    await addStatus('off50', bed, 'DISCONNECTED', 50, '7분 이상 신호가 없습니다.')
    await addAlert('offline', 'SENSOR_OFFLINE', 'NOTICE', 50, [], bed.id)
    await addStatus('on60', bed, 'CONNECTED', 60)
    await addStatus('low70', path, 'BATTERY_LOW', 70)
    await addAlert('lowBattery', 'LOW_BATTERY', 'INFO', 70, [], path.id)
    await addStatus('crit80', path, 'BATTERY_CRITICAL', 80, '배터리 4%')
    await addStatus('ok90', path, 'BATTERY_OK', 90) // 기록 대상이 아니다
    await addStatus('low20', path, 'BATTERY_LOW', 20) // 움직임 bed20 과 같은 시각 (정렬 동점)
  })
  afterAll(async () => {
    await ctx.close()
  })

  const list = async (query = '', who = client) => {
    const res = await who.get(`/api/timeline${query}`)
    expect(res.status, await res.clone().text()).toBe(200)
    return TimelineResponseSchema.parse(await res.json())
  }
  const ids = (events: TimelineEvent[]) => events.map((e) => e.id)
  const mov = (key: string) => `mov_${eventIds[key]}`
  const sta = (key: string) => `sta_${statusIds[key]}`

  it('로그인하지 않으면 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    for (const path of ['/api/timeline', '/api/timeline/summary', '/api/timeline/mov_x']) {
      expect((await anonymous.get(path)).status, path).toBe(401)
    }
  })

  it('기본은 최신순이고, 움직임 신호와 센서 상태 변화를 시간순으로 합친다 (배터리 회복은 제외)', async () => {
    const { events, nextCursor } = await list()
    expect(ids(events)).toEqual([
      sta('crit80'),
      sta('low70'),
      sta('on60'),
      sta('off50'),
      mov('bed40'),
      mov('door35'),
      mov('path30'),
      // 같은 20분: 센서 상태(sta_)가 움직임(mov_)보다 앞선다
      sta('low20'),
      mov('bed20'),
      mov('door15'),
      mov('path12'),
      mov('bed10'),
    ])
    expect(nextCursor).toBeNull()
    expect(ids(events)).not.toContain(sta('ok90'))
  })

  it('다른 가구의 기록은 섞이지 않는다', async () => {
    expect(ids((await list()).events)).not.toContain(mov('other'))
    const other = await list('', await ctx.loginAs(b))
    expect(ids(other.events)).toEqual([mov('other')])
  })

  it('유형·주의 수준·알림 연결을 원본에서 정한다', async () => {
    const byId = new Map((await list()).events.map((e) => [e.id, e]))
    const pick = (id: string) => byId.get(id)!
    expect(pick(mov('bed10'))).toMatchObject({
      eventType: 'BED_EXIT_CANDIDATE',
      attention: 'NOTICE',
      alertRaised: true,
    })
    expect(pick(mov('path12'))).toMatchObject({ eventType: 'MOTION_DETECTED', zone: 'PATH' }) // 이동 경로 신호는 일반 움직임
    expect(pick(mov('door15'))).toMatchObject({
      eventType: 'ENTRANCE_ACTIVITY',
      attention: 'URGENT',
      alertRaised: true,
    })
    expect(pick(mov('bed20'))).toMatchObject({
      eventType: 'MOTION_DETECTED',
      attention: 'NORMAL',
      alertRaised: false,
      alerts: [],
    })
    expect(pick(mov('door35'))).toMatchObject({
      eventType: 'ENTRANCE_ACTIVITY',
      attention: 'NORMAL',
      alertRaised: false,
    })
    expect(pick(mov('path30'))).toMatchObject({ origin: 'SIMULATED', eventType: 'MOTION_DETECTED' })
    // 알림 두 개가 연결되면 가장 높은 심각도
    expect(pick(mov('bed40'))).toMatchObject({
      eventType: 'BED_EXIT_CANDIDATE',
      attention: 'URGENT',
      isLate: true,
    })
    expect(
      pick(mov('bed40'))
        .alerts.map((x) => x.type)
        .sort(),
    ).toEqual(['BED_AREA_ACTIVITY', 'REPEATED_MOVEMENT'])
    expect(pick(mov('bed40')).receivedAt).toBe(iso(45))

    expect(pick(sta('off50'))).toMatchObject({
      eventType: 'SENSOR_OFFLINE',
      attention: 'NOTICE',
      alertRaised: true,
      sensorName: '침대 옆',
    })
    expect(pick(sta('off50')).alerts[0]?.id).toBe(alertIds['offline'])
    expect(pick(sta('off50')).description).toContain('7분 이상 신호가 없습니다')
    expect(pick(sta('on60'))).toMatchObject({
      eventType: 'SENSOR_RESTORED',
      attention: 'NORMAL',
      alertRaised: false,
    })
    expect(pick(sta('low70'))).toMatchObject({
      eventType: 'LOW_BATTERY',
      attention: 'INFO',
      alertRaised: true,
    })
    expect(pick(sta('crit80'))).toMatchObject({
      eventType: 'LOW_BATTERY',
      attention: 'NOTICE',
      alertRaised: false,
    })
    expect(pick(sta('crit80')).description).toContain('거의 남지 않았습니다')
    expect(pick(sta('off50')).occurredAt).toBe(iso(50))
    expect(pick(sta('off50')).receivedAt).toBe(iso(50))
  })

  it('판단에 사용된 규칙: 연결된 알림의 규칙(현재 설정 기준)과, 기록만 하는 경우의 이유', async () => {
    const byId = new Map((await list()).events.map((e) => [e.id, e]))
    expect(byId.get(mov('bed10'))?.rule).toMatchObject({ alertType: 'BED_TO_PATH' })
    expect(byId.get(mov('bed10'))?.rule.text).toContain('22:00~06:00')
    expect(byId.get(mov('bed40'))?.rule.alertType).toBe('REPEATED_MOVEMENT') // 더 높은 심각도
    expect(byId.get(mov('bed20'))?.rule).toEqual({
      alertType: null,
      text: '이 신호 하나는 알림 규칙에 해당하지 않아 기록으로만 남습니다.',
    })
    expect(byId.get(sta('on60'))?.rule.alertType).toBeNull()
  })

  it('설명에 금지 표현이 없고, 추정 유형은 추정이라고 밝힌다', async () => {
    const { events } = await list()
    const text = events.map((e) => `${e.description} ${e.rule.text}`).join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
    for (const e of events.filter(
      (x) => x.eventType === 'BED_EXIT_CANDIDATE' || x.eventType === 'ENTRANCE_ACTIVITY',
    )) {
      expect(e.description, e.id).toContain('추정')
    }
  })

  describe('필터', () => {
    it.each([
      ['BED_EXIT_CANDIDATE', ['mov:bed40', 'mov:bed10']],
      ['MOTION_DETECTED', ['mov:path30', 'mov:bed20', 'mov:path12']],
      ['ENTRANCE_ACTIVITY', ['mov:door35', 'mov:door15']],
      ['SENSOR_OFFLINE', ['sta:off50']],
      ['SENSOR_RESTORED', ['sta:on60']],
      ['LOW_BATTERY', ['sta:crit80', 'sta:low70', 'sta:low20']],
    ])('유형 %s', async (type, expected) => {
      const toId = (k: string) => (k.startsWith('mov') ? mov(k.slice(4)) : sta(k.slice(4)))
      expect(ids((await list(`?type=${type}`)).events)).toEqual(expected.map(toId))
    })

    it('센서', async () => {
      const result = (await list(`?sensorId=${door.id}`)).events
      expect(ids(result)).toEqual([mov('door35'), mov('door15')])
      const bedOnly = (await list(`?sensorId=${bed.id}`)).events
      // 침대 센서: 움직임 3건 + 끊김·복구
      expect(ids(bedOnly)).toEqual([
        sta('on60'),
        sta('off50'),
        mov('bed40'),
        mov('bed20'),
        mov('bed10'),
      ])
    })

    it.each([
      ['URGENT', ['mov:bed40', 'mov:door15']],
      ['NOTICE', ['sta:crit80', 'sta:off50', 'mov:path12', 'mov:bed10']],
      ['INFO', ['sta:low70', 'sta:low20']],
      ['NORMAL', ['sta:on60', 'mov:door35', 'mov:path30', 'mov:bed20']],
    ])('주의 수준 %s (알림이 여럿이면 가장 높은 수준에만 속한다)', async (level, expected) => {
      const toId = (k: string) => (k.startsWith('mov') ? mov(k.slice(4)) : sta(k.slice(4)))
      expect(new Set(ids((await list(`?attention=${level}`)).events))).toEqual(
        new Set(expected.map(toId)),
      )
    })

    it('알림 발생 여부', async () => {
      const yes = ids((await list('?alert=true')).events)
      expect(new Set(yes)).toEqual(
        new Set([
          mov('bed40'),
          mov('door15'),
          mov('path12'),
          mov('bed10'),
          sta('off50'),
          sta('low70'),
        ]),
      )
      const no = ids((await list('?alert=false')).events)
      expect(no).toHaveLength(12 - 6)
      expect(no).not.toContain(mov('bed10'))
    })

    it('기간(from·to 모두 경계 포함)', async () => {
      const from = encodeURIComponent(iso(15))
      const to = encodeURIComponent(iso(30))
      expect(ids((await list(`?from=${from}&to=${to}`)).events)).toEqual([
        mov('path30'),
        sta('low20'),
        mov('bed20'),
        mov('door15'),
      ])
    })

    it('조건을 함께 쓸 수 있다', async () => {
      const from11 = encodeURIComponent(iso(11))
      expect(ids((await list(`?type=LOW_BATTERY&attention=INFO&from=${from11}`)).events)).toEqual([
        sta('low70'),
        sta('low20'),
      ])
      const from30 = encodeURIComponent(iso(30))
      expect(ids((await list(`?type=LOW_BATTERY&attention=INFO&from=${from30}`)).events)).toEqual([
        sta('low70'),
      ])
    })

    it('다른 가구의 센서 ID 로 조회하면 빈 결과다', async () => {
      const otherSensor = await ctx.createSensor(b.householdId, { zone: 'PATH' })
      expect((await list(`?sensorId=${otherSensor.id}`)).events).toEqual([])
    })
  })

  describe('정렬과 페이지네이션', () => {
    it('오래된순', async () => {
      const desc = ids((await list()).events)
      const asc = ids((await list('?order=asc')).events)
      expect(asc).toEqual([...desc].reverse())
    })

    it.each(['desc', 'asc'])(
      '%s: 한 건씩·세 건씩 이어 읽어도 빠짐·중복 없이 전체와 같다',
      async (order) => {
        const all = ids((await list(`?order=${order}&limit=100`)).events)
        for (const limit of [1, 3, 5]) {
          const seen: string[] = []
          let cursor: string | null = null
          let pages = 0
          do {
            const page: Awaited<ReturnType<typeof list>> = await list(
              `?order=${order}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
            )
            expect(page.events.length).toBeLessThanOrEqual(limit)
            seen.push(...ids(page.events))
            cursor = page.nextCursor
            pages += 1
          } while (cursor && pages < 50)
          expect(seen, `limit ${limit}`).toEqual(all)
          expect(cursor).toBeNull()
        }
      },
    )

    it('필터와 커서를 함께 써도 이어 읽는다', async () => {
      const first = await list('?type=LOW_BATTERY&limit=2')
      expect(ids(first.events)).toEqual([sta('crit80'), sta('low70')])
      expect(first.nextCursor).not.toBeNull()
      const second = await list(`?type=LOW_BATTERY&limit=2&cursor=${first.nextCursor}`)
      expect(ids(second.events)).toEqual([sta('low20')])
      expect(second.nextCursor).toBeNull()
    })
  })

  describe('요약 (GET /api/timeline/summary)', () => {
    const summary = async (query = '') => {
      const res = await client.get(`/api/timeline/summary${query}`)
      expect(res.status).toBe(200)
      return TimelineSummaryResponseSchema.parse(await res.json())
    }

    it('전체 감지 건수·주의 이벤트 건수·알림 발생 건수·최근 시각을 센다', async () => {
      expect(await summary()).toMatchObject({
        total: 12,
        // 주의(NOTICE) 이상: bed40(긴급) door15(긴급) bed10 path12 off50 crit80
        attention: 6,
        alertRaised: 6,
        lastEventAt: iso(80),
      })
    })

    it('같은 조건을 적용하고, 조건에 맞는 것이 없으면 0건·null 이다', async () => {
      expect(await summary('?type=ENTRANCE_ACTIVITY')).toMatchObject({
        total: 2,
        attention: 1,
        alertRaised: 1,
        lastEventAt: iso(35),
      })
      const from = encodeURIComponent(iso(1000))
      expect(await summary(`?from=${from}`)).toMatchObject({
        total: 0,
        attention: 0,
        alertRaised: 0,
        lastEventAt: null,
      })
    })
  })

  describe('상세 (GET /api/timeline/:id)', () => {
    const detail = async (id: string, who = client) => {
      const res = await who.get(`/api/timeline/${id}`)
      return res
    }

    it('움직임 상세: 같은 알림의 근거가 된 다른 신호를 함께 준다', async () => {
      const res = await detail(mov('bed10'))
      expect(res.status).toBe(200)
      const body = TimelineDetailResponseSchema.parse(await res.json())
      expect(body.event.id).toBe(mov('bed10'))
      expect(body.relatedEvents.map((r) => r.id)).toEqual([mov('path12')])
      expect(body.relatedEvents[0]).toMatchObject({ sensorName: '복도', zone: 'PATH' })
    })

    it('연결된 알림이 없으면 관련 신호도 없다', async () => {
      const body = TimelineDetailResponseSchema.parse(await (await detail(mov('bed20'))).json())
      expect(body.relatedEvents).toEqual([])
    })

    it('센서 상태 상세', async () => {
      const body = TimelineDetailResponseSchema.parse(await (await detail(sta('off50'))).json())
      expect(body.event).toMatchObject({ eventType: 'SENSOR_OFFLINE', alertRaised: true })
      expect(body.relatedEvents).toEqual([])
    })

    it.each([
      ['없는 움직임', 'mov_nope'],
      ['없는 상태', 'sta_nope'],
      ['알 수 없는 형식', 'zzz'],
    ])('%s 는 404 이다', async (_label, id) => {
      const res = await detail(id)
      expect(res.status).toBe(404)
      ApiErrorBodySchema.parse(await res.json())
    })

    it('다른 가구의 기록과 기록 대상이 아닌 상태(배터리 회복)는 404 이다 (존재 여부를 알려 주지 않는다)', async () => {
      expect((await detail(mov('other'))).status).toBe(404)
      expect((await detail(sta('ok90'))).status).toBe(404)
      expect((await detail(mov('bed10'), await ctx.loginAs(b))).status).toBe(404)
    })
  })

  it.each([
    ['limit=0'],
    ['limit=101'],
    ['type=FALL'],
    ['attention=HIGH'],
    ['alert=maybe'],
    ['order=random'],
    ['from=어제'],
    ['cursor=%%%'],
  ])('잘못된 쿼리(%s)는 400 이다', async (query) => {
    const res = await client.get(`/api/timeline?${query}`)
    expect(res.status).toBe(400)
    ApiErrorBodySchema.parse(await res.json())
  })
})
