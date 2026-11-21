import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import {
  IMPORTANT_SEVERITIES,
  type Alert,
  type AlertDetail,
  type AlertItem,
  type AlertListResponse,
  type AlertUnreadCountResponse,
} from '@tetris/shared'
import type { AlertListFilter } from '@/services/api/types'
import { queryKeys } from './queryKeys'

/**
 * 알림 목록 캐시를 실시간 신호로 바로 고치는 함수들.
 * 소켓으로 알림이 오면 서버에서 다시 읽기 전에 화면에 먼저 반영하되, ID 로 합쳐서 같은 알림이 두 번 생기지 않게 한다.
 * (그 뒤 invalidate 로 서버의 값과 다시 맞춘다. 이 캐시는 서버보다 앞서 가는 임시 값일 뿐이다)
 */

/** 이 알림이 목록 조건에 맞는가 */
export function matchesAlertFilter(alert: AlertItem, filter: AlertListFilter): boolean {
  if (filter.status && !filter.status.includes(alert.status)) return false
  if (filter.type && alert.type !== filter.type) return false
  if (filter.origin && alert.origin !== filter.origin) return false
  if (filter.unread && alert.read) return false
  if (filter.important && !IMPORTANT_SEVERITIES.includes(alert.severity)) return false
  return true
}

/**
 * 목록에 알림 하나를 반영한다. 최신순 목록을 가정한다.
 *  - 이미 있으면 같은 자리에서 내용만 바꾼다. (읽음 여부는 서버가 보호자별로 알려 주므로 그대로 둔다)
 *  - 조건에 더 이상 맞지 않으면(예: 진행 중 목록에서 종료됨) 뺀다.
 *  - 없고 조건에 맞으면 새 알림으로 보고 맨 앞에 넣는다. (이미 불러온 범위보다 오래된 알림은 넣지 않는다)
 *  - 어느 경우에도 같은 ID 가 두 번 들어가지 않는다.
 */
export function upsertAlertItem(
  alerts: readonly AlertItem[],
  incoming: Alert,
  filter: AlertListFilter,
  complete: boolean,
): AlertItem[] {
  const existing = alerts.find((alert) => alert.id === incoming.id)
  const item: AlertItem = { ...incoming, read: existing?.read ?? false }
  const fits = matchesAlertFilter(item, filter)
  const others = alerts.filter((alert) => alert.id !== incoming.id)
  if (existing) {
    if (!fits) return others
    return alerts.map((alert) => (alert.id === incoming.id ? item : alert))
  }
  if (!fits) return [...alerts]
  const oldest = alerts.at(-1)
  const reachable = complete || !oldest || incoming.triggeredAt >= oldest.triggeredAt
  if (!reachable) return [...alerts]
  return [item, ...others].sort(
    (a, b) => b.triggeredAt.localeCompare(a.triggeredAt) || (a.id < b.id ? 1 : -1),
  )
}

type AlertQueryKind = 'pages' | 'list' | 'detail' | 'unread'

function kindOf(key: readonly unknown[]): AlertQueryKind | null {
  const kind = key[1]
  return kind === 'pages' || kind === 'list' || kind === 'detail' || kind === 'unread' ? kind : null
}

function filterOf(key: readonly unknown[]): AlertListFilter {
  const value = key[2]
  return typeof value === 'object' && value !== null ? value : {}
}

/** 캐시에 이 알림이 이미 있는가 (이미 센 알림을 읽지 않은 수에 또 더하지 않기 위해) */
function isCached(queryClient: QueryClient, alertId: string): boolean {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.alerts.all })) {
    const kind = kindOf(query.queryKey)
    if (kind === 'pages') {
      const data = query.state.data as InfiniteData<AlertListResponse> | undefined
      if (data?.pages.some((page) => page.alerts.some((alert) => alert.id === alertId))) return true
    } else if (kind === 'list') {
      const data = query.state.data as AlertListResponse | undefined
      if (data?.alerts.some((alert) => alert.id === alertId)) return true
    } else if (kind === 'detail') {
      if (query.queryKey[2] === alertId && query.state.data) return true
    }
  }
  return false
}

/**
 * 실시간으로 온 알림(alert.created / alert.updated)을 알림 목록·상세 캐시에 ID 기준으로 반영한다.
 * 새로 생긴 알림이면 읽지 않은 알림 수도 먼저 올려 둔다.
 */
export function applyRealtimeAlert(
  queryClient: QueryClient,
  incoming: Alert,
  options: { created: boolean },
): void {
  const known = isCached(queryClient, incoming.id)

  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.alerts.all })) {
    const kind = kindOf(query.queryKey)
    const filter = filterOf(query.queryKey)
    if (kind === 'pages') {
      queryClient.setQueryData<InfiniteData<AlertListResponse>>(query.queryKey, (data) => {
        if (!data || data.pages.length === 0) return data
        const complete = data.pages.at(-1)?.nextCursor === null
        const all = data.pages.flatMap((page) => page.alerts)
        const next = upsertAlertItem(all, incoming, filter, complete)
        // 쪽 경계는 의미가 없으므로 합친 목록을 첫 쪽에 모은다. 마지막 쪽의 nextCursor 는 그대로라 이어 읽기는 변하지 않는다.
        return {
          ...data,
          pages: data.pages.map((page, index) => ({ ...page, alerts: index === 0 ? next : [] })),
        }
      })
    } else if (kind === 'list') {
      queryClient.setQueryData<AlertListResponse>(query.queryKey, (data) =>
        data
          ? {
              ...data,
              alerts: upsertAlertItem(data.alerts, incoming, filter, data.nextCursor === null),
            }
          : data,
      )
    } else if (kind === 'detail' && query.queryKey[2] === incoming.id) {
      queryClient.setQueryData<AlertDetail>(query.queryKey, (data) =>
        data ? { ...data, alert: { ...incoming, read: data.alert.read } } : data,
      )
    }
  }

  if (options.created && !known) {
    queryClient.setQueryData<AlertUnreadCountResponse>(queryKeys.alerts.unread, (data) =>
      data
        ? {
            unread: data.unread + 1,
            unreadImportant:
              data.unreadImportant + (IMPORTANT_SEVERITIES.includes(incoming.severity) ? 1 : 0),
          }
        : data,
    )
  }
}

/** 지정한 알림(또는 전부)을 캐시에서 읽음으로 바꾸고, 읽지 않은 수를 그만큼 줄인다. 되돌리기 위한 이전 값을 돌려준다. */
export function applyReadToCaches(
  queryClient: QueryClient,
  target: { ids: readonly string[] } | 'all',
): () => void {
  const snapshots = queryClient.getQueriesData({ queryKey: queryKeys.alerts.all })
  const isTarget = (id: string) => target === 'all' || target.ids.includes(id)
  let newlyRead = 0
  let newlyReadImportant = 0
  const seen = new Set<string>()
  const markItem = (item: AlertItem): AlertItem => {
    if (!isTarget(item.id) || item.read) return item
    if (!seen.has(item.id)) {
      seen.add(item.id)
      newlyRead += 1
      if (IMPORTANT_SEVERITIES.includes(item.severity)) newlyReadImportant += 1
    }
    return { ...item, read: true }
  }

  for (const [key, data] of snapshots) {
    const kind = kindOf(key)
    if (kind === 'pages' && data) {
      const pages = data as InfiniteData<AlertListResponse>
      queryClient.setQueryData<InfiniteData<AlertListResponse>>(key, {
        ...pages,
        pages: pages.pages.map((page) => ({ ...page, alerts: page.alerts.map(markItem) })),
      })
    } else if (kind === 'list' && data) {
      const list = data as AlertListResponse
      queryClient.setQueryData<AlertListResponse>(key, {
        ...list,
        alerts: list.alerts.map(markItem),
      })
    } else if (kind === 'detail' && data) {
      const detail = data as AlertDetail
      queryClient.setQueryData<AlertDetail>(key, { ...detail, alert: markItem(detail.alert) })
    }
  }

  const count = queryClient.getQueryData<AlertUnreadCountResponse>(queryKeys.alerts.unread)
  if (count) {
    queryClient.setQueryData<AlertUnreadCountResponse>(
      queryKeys.alerts.unread,
      target === 'all'
        ? { unread: 0, unreadImportant: 0 }
        : {
            unread: Math.max(0, count.unread - newlyRead),
            unreadImportant: Math.max(0, count.unreadImportant - newlyReadImportant),
          },
    )
  }

  return () => {
    for (const [key, data] of snapshots) queryClient.setQueryData(key, data)
  }
}
