import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { AlertListResponse, AlertUnreadCountResponse } from '@tetris/shared'
import { makeAlert } from '@/test/fixtures'
import {
  applyReadToCaches,
  applyRealtimeAlert,
  matchesAlertFilter,
  upsertAlertItem,
} from './alertCache'
import { queryKeys } from './queryKeys'

const at = (minute: number) => `2026-11-13T15:${String(minute).padStart(2, '0')}:00.000Z`
const item = (id: string, minute: number, extra = {}) =>
  makeAlert({ id, triggeredAt: at(minute), ...extra })
const ids = (alerts: { id: string }[]) => alerts.map((a) => a.id)

describe('matchesAlertFilter', () => {
  it('상태·종류·읽지 않음·중요 조건을 본다', () => {
    const alert = item('a', 1, {
      status: 'OPEN',
      type: 'BED_TO_PATH',
      severity: 'NOTICE',
      read: false,
    })
    expect(matchesAlertFilter(alert, {})).toBe(true)
    expect(matchesAlertFilter(alert, { status: ['OPEN', 'ACKNOWLEDGED'] })).toBe(true)
    expect(matchesAlertFilter(alert, { status: ['RESOLVED'] })).toBe(false)
    expect(matchesAlertFilter(alert, { type: 'LOW_BATTERY' })).toBe(false)
    expect(matchesAlertFilter(alert, { unread: 'true' })).toBe(true)
    expect(matchesAlertFilter({ ...alert, read: true }, { unread: 'true' })).toBe(false)
    expect(matchesAlertFilter(alert, { important: 'true' })).toBe(true)
    expect(matchesAlertFilter({ ...alert, severity: 'INFO' }, { important: 'true' })).toBe(false)
  })
})

describe('upsertAlertItem: ID 기준으로 합친다', () => {
  const list = [item('c', 30), item('b', 20), item('a', 10)]

  it('새 알림은 최신순 자리에 한 번만 들어간다', () => {
    const next = upsertAlertItem(list, item('d', 40), {}, true)
    expect(ids(next)).toEqual(['d', 'c', 'b', 'a'])
    // 같은 알림이 다시 와도 한 번만
    expect(ids(upsertAlertItem(next, item('d', 40), {}, true))).toEqual(['d', 'c', 'b', 'a'])
  })

  it('이미 있는 알림은 같은 자리에서 내용만 바뀌고, 읽음 여부는 유지된다', () => {
    const withRead = [item('c', 30), item('b', 20, { read: true, status: 'OPEN' }), item('a', 10)]
    const next = upsertAlertItem(withRead, item('b', 20, { status: 'ACKNOWLEDGED' }), {}, true)
    expect(ids(next)).toEqual(['c', 'b', 'a'])
    expect(next[1]).toMatchObject({ status: 'ACKNOWLEDGED', read: true })
  })

  it('조건에 더 이상 맞지 않으면 목록에서 뺀다 (진행 중 목록에서 종료됨)', () => {
    const next = upsertAlertItem(
      list,
      item('b', 20, { status: 'RESOLVED' }),
      { status: ['OPEN'] },
      true,
    )
    expect(ids(next)).toEqual(['c', 'a'])
  })

  it('조건에 맞지 않는 새 알림은 넣지 않는다', () => {
    expect(
      ids(upsertAlertItem(list, item('d', 40, { severity: 'INFO' }), { important: 'true' }, true)),
    ).toEqual(['c', 'b', 'a'])
  })

  it('아직 불러오지 않은 범위의 오래된 알림은 넣지 않는다 (다음 쪽이 있을 때)', () => {
    expect(ids(upsertAlertItem(list, item('old', 1), {}, false))).toEqual(['c', 'b', 'a'])
    expect(ids(upsertAlertItem(list, item('old', 1), {}, true))).toEqual(['c', 'b', 'a', 'old'])
  })

  it('입력 목록을 바꾸지 않는다', () => {
    const copy = [...list]
    upsertAlertItem(list, item('d', 40), {}, true)
    expect(list).toEqual(copy)
  })
})

function setup() {
  const queryClient = new QueryClient()
  const filter = { limit: 30 }
  queryClient.setQueryData<InfiniteData<AlertListResponse>>(
    [...queryKeys.alerts.all, 'pages', filter],
    {
      pages: [{ alerts: [item('b', 20), item('a', 10)], nextCursor: null }],
      pageParams: [undefined],
    },
  )
  queryClient.setQueryData<AlertUnreadCountResponse>(queryKeys.alerts.unread, {
    unread: 2,
    unreadImportant: 2,
  })
  const pages = () =>
    queryClient.getQueryData<InfiniteData<AlertListResponse>>([
      ...queryKeys.alerts.all,
      'pages',
      filter,
    ])!.pages
  const count = () => queryClient.getQueryData<AlertUnreadCountResponse>(queryKeys.alerts.unread)!
  return { queryClient, pages, count }
}

describe('applyRealtimeAlert', () => {
  it('새 알림은 목록에 넣고 읽지 않은 수(중요 포함)를 한 번만 올린다', () => {
    const { queryClient, pages, count } = setup()
    const incoming = item('c', 30, { severity: 'URGENT' })
    applyRealtimeAlert(queryClient, incoming, { created: true })
    applyRealtimeAlert(queryClient, incoming, { created: true }) // 같은 알림이 또 와도
    expect(ids(pages().flatMap((p) => p.alerts))).toEqual(['c', 'b', 'a'])
    expect(count()).toEqual({ unread: 3, unreadImportant: 3 })
  })

  it('이미 목록에 있는 알림이 created 로 다시 와도 수를 올리지 않는다', () => {
    const { queryClient, count } = setup()
    applyRealtimeAlert(queryClient, item('a', 10), { created: true })
    expect(count()).toEqual({ unread: 2, unreadImportant: 2 })
  })

  it('updated 는 수를 바꾸지 않고, 읽음 여부도 바꾸지 않는다', () => {
    const { queryClient, pages, count } = setup()
    applyReadToCaches(queryClient, { ids: ['a'] })
    applyRealtimeAlert(queryClient, item('a', 10, { status: 'ACKNOWLEDGED' }), { created: false })
    expect(pages()[0]?.alerts.find((a) => a.id === 'a')).toMatchObject({
      status: 'ACKNOWLEDGED',
      read: true,
    })
    expect(count()).toEqual({ unread: 1, unreadImportant: 1 })
  })
})

describe('applyReadToCaches', () => {
  it('지정한 알림을 읽음으로 바꾸고 읽지 않은 수를 줄이며, 되돌릴 수 있다', () => {
    const { queryClient, pages, count } = setup()
    const rollback = applyReadToCaches(queryClient, { ids: ['a'] })
    expect(pages()[0]?.alerts.map((a) => [a.id, a.read])).toEqual([
      ['b', false],
      ['a', true],
    ])
    expect(count()).toEqual({ unread: 1, unreadImportant: 1 })
    rollback()
    expect(pages()[0]?.alerts.map((a) => a.read)).toEqual([false, false])
    expect(count()).toEqual({ unread: 2, unreadImportant: 2 })
  })

  it('이미 읽은 알림을 다시 읽음 처리해도 수가 더 줄지 않는다', () => {
    const { queryClient, count } = setup()
    applyReadToCaches(queryClient, { ids: ['a'] })
    applyReadToCaches(queryClient, { ids: ['a'] })
    expect(count()).toEqual({ unread: 1, unreadImportant: 1 })
  })

  it('모두 읽음은 수를 0으로 만들고 처리 상태는 건드리지 않는다', () => {
    const { queryClient, pages, count } = setup()
    applyReadToCaches(queryClient, 'all')
    expect(pages()[0]?.alerts.every((a) => a.read && a.status === 'OPEN')).toBe(true)
    expect(count()).toEqual({ unread: 0, unreadImportant: 0 })
  })
})
