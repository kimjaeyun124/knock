import { describe, expect, it } from 'vitest'
import {
  TimelineDetailResponseSchema,
  TimelineResponseSchema,
  TimelineSummaryResponseSchema,
  FORBIDDEN_PHRASES,
  TIMELINE_EVENT_TYPES,
  type TimelineEvent,
} from '@tetris/shared'
import { createMockApiClient } from './mock'
import { createMockTimelineEvents } from './mockTimeline'

const NOW = new Date('2026-11-14T03:00:00.000Z')
const api = () => createMockApiClient(() => NOW).timeline!
const ids = (events: TimelineEvent[]) => events.map((e) => e.id)

describe('움직임 기록 Mock', () => {
  it('서버와 같은 계약(스키마)을 따르고 Mock 표식이 붙는다', async () => {
    const list = await api().list({})
    expect(() => TimelineResponseSchema.parse(list)).not.toThrow()
    expect(list).toMatchObject({ mock: true })
    const summary = await api().summary({})
    expect(() => TimelineSummaryResponseSchema.parse(summary)).not.toThrow()
    const detail = await api().get(list.events[0]!.id)
    expect(() => TimelineDetailResponseSchema.parse(detail)).not.toThrow()
  })

  it('모든 값이 샘플임을 알아볼 수 있다 (이름에 (샘플), 출처는 시뮬레이션)', () => {
    for (const event of createMockTimelineEvents(NOW)) {
      expect(event.sensorName).toMatch(/^\(샘플\)/)
      expect(event.origin).toBe('SIMULATED')
      expect(event.sensorId).toMatch(/^mock-/)
    }
  })

  it('여섯 가지 이벤트 유형이 모두 나오고, 금지 표현이 없다', () => {
    const events = createMockTimelineEvents(NOW)
    expect(new Set(events.map((e) => e.eventType))).toEqual(new Set(TIMELINE_EVENT_TYPES))
    const text = events.map((e) => `${e.description} ${e.rule.text}`).join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
  })

  it('최신순이 기본이고 오래된순은 정확히 반대다', async () => {
    const desc = ids((await api().list({ limit: 100 })).events)
    const asc = ids((await api().list({ order: 'asc', limit: 100 })).events)
    expect(asc).toEqual([...desc].reverse())
  })

  it('조건: 유형·주의 수준·알림 여부·센서·기간', async () => {
    const all = (await api().list({ limit: 100 })).events
    const only = async (filter: Parameters<ReturnType<typeof api>['list']>[0]) =>
      (await api().list({ ...filter, limit: 100 })).events
    expect((await only({ type: 'LOW_BATTERY' })).every((e) => e.eventType === 'LOW_BATTERY')).toBe(
      true,
    )
    expect((await only({ attention: 'URGENT' })).every((e) => e.attention === 'URGENT')).toBe(true)
    expect((await only({ alert: 'true' })).every((e) => e.alertRaised)).toBe(true)
    expect((await only({ alert: 'false' })).every((e) => !e.alertRaised)).toBe(true)
    expect(
      (await only({ sensorId: 'mock-entrance' })).every((e) => e.sensorId === 'mock-entrance'),
    ).toBe(true)
    const from = '2026-11-12T00:00:00.000Z'
    expect((await only({ from })).every((e) => e.occurredAt >= from)).toBe(true)
    expect((await only({ from })).length).toBeLessThan(all.length)
    // 알림 여부 두 조건은 서로소이고 합치면 전체다
    expect((await only({ alert: 'true' })).length + (await only({ alert: 'false' })).length).toBe(
      all.length,
    )
  })

  it('cursor 로 이어 읽으면 빠짐·중복 없이 전체와 같다', async () => {
    const all = ids((await api().list({ limit: 100 })).events)
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: Awaited<ReturnType<ReturnType<typeof api>['list']>> = await api().list({
        limit: 7,
        ...(cursor ? { cursor } : {}),
      })
      seen.push(...ids(page.events))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(all)
  })

  it('요약은 같은 조건 전체의 건수·주의 이벤트·최근 시각이다', async () => {
    const filtered = (await api().list({ type: 'ENTRANCE_ACTIVITY', limit: 100 })).events
    const summary = await api().summary({ type: 'ENTRANCE_ACTIVITY' })
    expect(summary.total).toBe(filtered.length)
    expect(summary.lastEventAt).toBe(filtered[0]?.occurredAt)
    expect(summary.attention).toBe(
      filtered.filter((e) => e.attention === 'URGENT' || e.attention === 'NOTICE').length,
    )
  })

  it('상세: 같은 알림의 다른 신호를 함께 주고, 없는 기록은 404 이다', async () => {
    const events = (await api().list({ type: 'BED_EXIT_CANDIDATE', limit: 100 })).events
    const detail = await api().get(events[0]!.id)
    expect(detail.relatedEvents.length).toBeGreaterThan(0)
    await expect(api().get('mov_nope')).rejects.toMatchObject({ status: 404 })
  })
})
