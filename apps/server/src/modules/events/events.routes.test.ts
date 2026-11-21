import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema, EventsResponseSchema, type MovementEvent } from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

const T0 = Date.parse('2026-11-14T00:00:00.000Z')
const at = (minutes: number) => new Date(T0 + minutes * 60_000)

describe('움직임 기록 조회 API', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold
  let clientA: TestClient
  let bed: { id: string }
  let door: { id: string }

  beforeAll(async () => {
    ctx = await createTestContext()
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
    clientA = await ctx.loginAs(a)
    bed = await ctx.createSensor(a.householdId, { name: '침대 옆', zone: 'BED_SIDE' })
    door = await ctx.createSensor(a.householdId, { name: '현관문', zone: 'ENTRANCE' })

    let n = 0
    const add = (
      sensor: { id: string },
      zone: 'BED_SIDE' | 'ENTRANCE',
      minutes: number,
      extra = {},
    ) =>
      ctx.prisma.movementEvent.create({
        data: {
          householdId: a.householdId,
          sensorId: sensor.id,
          zone,
          origin: 'REAL',
          deviceEventId: `seed-evt-${String(++n).padStart(4, '0')}`,
          occurredAt: at(minutes),
          ...extra,
        },
      })
    // 10, 20, 30분: 침대 / 15, 25분: 현관(25분은 시뮬레이션) / 40분: 지연 수신된 침대 이벤트
    await add(bed, 'BED_SIDE', 10)
    await add(door, 'ENTRANCE', 15)
    await add(bed, 'BED_SIDE', 20)
    await add(door, 'ENTRANCE', 25, { origin: 'SIMULATED' })
    await add(bed, 'BED_SIDE', 30)
    await add(bed, 'BED_SIDE', 40, { isLate: true })
    // 다른 가구의 기록
    const other = await ctx.createSensor(b.householdId, { zone: 'PATH' })
    await ctx.prisma.movementEvent.create({
      data: {
        householdId: b.householdId,
        sensorId: other.id,
        zone: 'PATH',
        origin: 'REAL',
        deviceEventId: 'other-house-evt',
        occurredAt: at(35),
      },
    })
  })
  afterAll(async () => {
    await ctx.close()
  })

  const list = async (query = '', client = clientA) => {
    const res = await client.get(`/api/events${query}`)
    expect(res.status).toBe(200)
    return EventsResponseSchema.parse(await res.json())
  }
  const minutes = (events: MovementEvent[]) =>
    events.map((e) => (Date.parse(e.occurredAt) - T0) / 60_000)

  it('로그인하지 않으면 401 이다', async () => {
    expect((await new TestClient(ctx.baseUrl).get('/api/events')).status).toBe(401)
  })

  it('최신순으로 돌려주고, 센서 이름·구역·출처·지연 여부를 함께 담는다', async () => {
    const { events, nextCursor } = await list()
    expect(minutes(events)).toEqual([40, 30, 25, 20, 15, 10])
    expect(nextCursor).toBeNull()
    expect(events[0]).toMatchObject({
      sensorName: '침대 옆',
      zone: 'BED_SIDE',
      origin: 'REAL',
      isLate: true,
    })
    expect(events[2]).toMatchObject({ sensorName: '현관문', zone: 'ENTRANCE', origin: 'SIMULATED' })
  })

  it('다른 가구의 기록은 섞이지 않는다', async () => {
    const { events } = await list()
    expect(minutes(events)).not.toContain(35)
    const other = await list('', await ctx.loginAs(b))
    expect(minutes(other.events)).toEqual([35])
  })

  describe('필터', () => {
    it('구역', async () => {
      expect(minutes((await list('?zone=ENTRANCE')).events)).toEqual([25, 15])
    })
    it('센서', async () => {
      expect(minutes((await list(`?sensorId=${door.id}`)).events)).toEqual([25, 15])
    })
    it('출처(실제/시뮬레이션)', async () => {
      expect(minutes((await list('?origin=SIMULATED')).events)).toEqual([25])
      expect(minutes((await list('?origin=REAL')).events)).toEqual([40, 30, 20, 15, 10])
    })
    it('기간(from·to 모두 경계 포함)', async () => {
      const from = encodeURIComponent(at(15).toISOString())
      const to = encodeURIComponent(at(30).toISOString())
      expect(minutes((await list(`?from=${from}&to=${to}`)).events)).toEqual([30, 25, 20, 15])
    })
    it('조건을 함께 쓸 수 있다', async () => {
      const from = encodeURIComponent(at(12).toISOString())
      expect(minutes((await list(`?zone=BED_SIDE&from=${from}`)).events)).toEqual([40, 30, 20])
    })
    it('다른 가구의 센서 ID 로 조회하면 빈 결과다 (존재 여부를 알려 주지 않음)', async () => {
      const otherSensor = (
        await ctx.prisma.sensor.findFirstOrThrow({ where: { householdId: b.householdId } })
      ).id
      expect((await list(`?sensorId=${otherSensor}`)).events).toEqual([])
    })
  })

  describe('페이지 나누기', () => {
    it('limit 만큼 끊어 읽고 nextCursor 로 이어 읽으면 빠짐·중복 없이 전부 읽힌다', async () => {
      const first = await list('?limit=4')
      expect(minutes(first.events)).toEqual([40, 30, 25, 20])
      expect(first.nextCursor).toBeTruthy()

      const second = await list(`?limit=4&cursor=${first.nextCursor}`)
      expect(minutes(second.events)).toEqual([15, 10])
      expect(second.nextCursor).toBeNull()
    })

    it('발생 시각이 같은 이벤트가 많아도 페이지 경계에서 빠지거나 겹치지 않는다', async () => {
      const user = await ctx.createHousehold()
      const client = await ctx.loginAs(user)
      const sensor = await ctx.createSensor(user.householdId)
      const sameInstant = at(500)
      for (let i = 0; i < 7; i += 1) {
        await ctx.prisma.movementEvent.create({
          data: {
            householdId: user.householdId,
            sensorId: sensor.id,
            zone: 'PATH',
            origin: 'REAL',
            deviceEventId: `tie-evt-${i}`,
            occurredAt: sameInstant,
          },
        })
      }
      const seen: string[] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const page: Awaited<ReturnType<typeof list>> = await list(
          `?limit=3${cursor ? `&cursor=${cursor}` : ''}`,
          client,
        )
        seen.push(...page.events.map((e) => e.id))
        cursor = page.nextCursor
        pages += 1
      } while (cursor && pages < 10)
      expect(pages).toBe(3)
      expect(seen).toHaveLength(7)
      expect(new Set(seen).size).toBe(7)
    })

    it('정확히 limit 건만 있으면 다음 쪽은 없다', async () => {
      const { events, nextCursor } = await list('?limit=6')
      expect(events).toHaveLength(6)
      expect(nextCursor).toBeNull()
    })
  })

  describe('잘못된 요청', () => {
    it.each([
      ['limit 0', '?limit=0'],
      ['limit 201', '?limit=201'],
      ['limit 숫자 아님', '?limit=many'],
      ['알 수 없는 구역', '?zone=KITCHEN'],
      ['날짜 형식', '?from=yesterday'],
      ['깨진 cursor', '?cursor=%%%'],
      ['형식이 다른 cursor', `?cursor=${Buffer.from('not-a-cursor').toString('base64url')}`],
    ])('%s → 400', async (_name, query) => {
      const res = await clientA.get(`/api/events${query}`)
      expect(res.status).toBe(400)
      expect(['VALIDATION_ERROR', 'BAD_REQUEST']).toContain(
        ApiErrorBodySchema.parse(await res.json()).error.code,
      )
    })
  })
})
