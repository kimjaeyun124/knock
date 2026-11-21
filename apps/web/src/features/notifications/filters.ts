import { ALERT_STATUSES, ALERT_TYPES, type AlertStatus, type AlertType } from '@tetris/shared'
import type { AlertListFilter } from '@/services/api/types'

/** 알림 센터의 보기: 전체 / 읽지 않음 / 중요 */
export const ALERT_VIEWS = ['all', 'unread', 'important'] as const
export type AlertView = (typeof ALERT_VIEWS)[number]

export const ALERT_VIEW_LABELS: Record<AlertView, string> = {
  all: '전체',
  unread: '읽지 않음',
  important: '중요',
}

export interface AlertFilters {
  view: AlertView
  type: AlertType | ''
  status: AlertStatus | ''
}

export const PAGE_SIZE = 30

const includes = <T extends string>(list: readonly T[], value: string | null): value is T =>
  value !== null && (list as readonly string[]).includes(value)

/** 주소의 쿼리(?view=unread&type=…&status=…)에서 조건을 읽는다. 올바르지 않은 값은 "전체"로 취급한다. */
export function parseAlertFilters(params: URLSearchParams): AlertFilters {
  const view = params.get('view')
  const type = params.get('type')
  const status = params.get('status')
  return {
    view: includes(ALERT_VIEWS, view) ? view : 'all',
    type: includes(ALERT_TYPES, type) ? type : '',
    status: includes(ALERT_STATUSES, status) ? status : '',
  }
}

/** 조건을 주소 쿼리로 만든다. 기본값(전체)은 넣지 않는다. */
export function alertFiltersToParams(filters: AlertFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.view !== 'all') params.set('view', filters.view)
  if (filters.type) params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  return params
}

export function isDefaultAlertFilters(filters: AlertFilters): boolean {
  return alertFiltersToParams(filters).toString() === ''
}

/** 서버 조회 조건 */
export function toAlertListFilter(filters: AlertFilters): Omit<AlertListFilter, 'cursor'> {
  return {
    limit: PAGE_SIZE,
    ...(filters.view === 'unread' ? { unread: 'true' as const } : {}),
    ...(filters.view === 'important' ? { important: 'true' as const } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: [filters.status] } : {}),
  }
}
