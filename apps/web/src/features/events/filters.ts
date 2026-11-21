import {
  TIMELINE_ATTENTION_LEVELS,
  TIMELINE_EVENT_TYPES,
  type TimelineAttention,
  type TimelineEventType,
  type TimelineFilter,
  type TimelineOrder,
  type TimelineQuery,
} from '@tetris/shared'
import {
  addDaysToKey,
  isValidDateKey,
  localDateKey,
  localDayEnd,
  localDayStart,
} from '@/lib/localTime'

/** 조회 기간 빠른 선택 */
export type PeriodPreset = 'today' | 'week' | 'month'

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: '오늘',
  week: '최근 7일',
  month: '최근 30일',
}
const PERIOD_DAYS: Record<PeriodPreset, number> = { today: 1, week: 7, month: 30 }

/** 화면의 조건. 날짜는 로컬 날짜(YYYY-MM-DD)이고, 서버에는 로컬 하루의 시작·끝을 ISO 로 바꿔 보낸다. */
export interface EventFilters {
  from: string
  to: string
  sensorId: string
  type: TimelineEventType | ''
  attention: TimelineAttention | ''
  alert: 'true' | 'false' | ''
  order: TimelineOrder
}

/** 기간을 정하지 않았을 때의 기본: 오늘을 포함한 최근 7일 */
export const DEFAULT_PERIOD: PeriodPreset = 'week'

export function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  return { from: addDaysToKey(today, -(PERIOD_DAYS[preset] - 1)), to: today }
}

/** 현재 기간이 어느 빠른 선택과 같은지. 같은 것이 없으면 null (직접 정한 기간) */
export function matchPreset(
  range: { from: string; to: string },
  today: string,
): PeriodPreset | null {
  for (const preset of Object.keys(PERIOD_LABELS) as PeriodPreset[]) {
    const expected = presetRange(preset, today)
    if (expected.from === range.from && expected.to === range.to) return preset
  }
  return null
}

const includes = <T extends string>(list: readonly T[], value: string | null): value is T =>
  value !== null && (list as readonly string[]).includes(value)

/**
 * 주소의 쿼리(?from=…&type=…)에서 조건을 읽는다. 올바르지 않은 값은 "전체"로 취급해 화면이 깨지지 않게 한다.
 * 조건이 주소에 있으므로 새로고침·뒤로 가기·링크 공유로도 같은 목록이 열린다.
 */
export function parseFilters(params: URLSearchParams, today: string): EventFilters {
  const preset = presetRange(DEFAULT_PERIOD, today)
  const from = params.get('from')
  const to = params.get('to')
  const type = params.get('type')
  const attention = params.get('attention')
  const alert = params.get('alert')
  return {
    from: from && isValidDateKey(from) ? from : preset.from,
    to: to && isValidDateKey(to) ? to : preset.to,
    sensorId: params.get('sensor') ?? '',
    type: includes(TIMELINE_EVENT_TYPES, type) ? type : '',
    attention: includes(TIMELINE_ATTENTION_LEVELS, attention) ? attention : '',
    alert: alert === 'true' || alert === 'false' ? alert : '',
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
  }
}

/** 조건을 주소 쿼리로 만든다. 기본값과 같은 항목은 빼서 주소를 짧게 둔다. */
export function filtersToParams(filters: EventFilters, today: string): URLSearchParams {
  const params = new URLSearchParams()
  const preset = presetRange(DEFAULT_PERIOD, today)
  if (filters.from !== preset.from) params.set('from', filters.from)
  if (filters.to !== preset.to) params.set('to', filters.to)
  if (filters.sensorId) params.set('sensor', filters.sensorId)
  if (filters.type) params.set('type', filters.type)
  if (filters.attention) params.set('attention', filters.attention)
  if (filters.alert) params.set('alert', filters.alert)
  if (filters.order === 'asc') params.set('order', 'asc')
  return params
}

/** 기본 조건(초기화한 상태)인가 */
export function isDefaultFilters(filters: EventFilters, today: string): boolean {
  return filtersToParams(filters, today).toString() === ''
}

/** 조건이 올바른가. 시작 날짜가 종료 날짜보다 늦으면 조회하지 않고 이유를 알린다. */
export function rangeError(filters: Pick<EventFilters, 'from' | 'to'>): string | null {
  return filters.from > filters.to
    ? '시작 날짜가 종료 날짜보다 늦습니다. 날짜를 바꿔 주세요.'
    : null
}

/** 서버 조회 조건(페이지·정렬 제외). 날짜는 로컬 하루의 시작·끝으로 바꾼다. */
export function toTimelineFilter(filters: EventFilters): TimelineFilter {
  const from = localDayStart(filters.from)
  const to = localDayEnd(filters.to)
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(filters.sensorId ? { sensorId: filters.sensorId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.attention ? { attention: filters.attention } : {}),
    ...(filters.alert ? { alert: filters.alert } : {}),
  }
}

export const PAGE_SIZE = 30

export function toTimelineQuery(filters: EventFilters): Omit<TimelineQuery, 'cursor'> {
  return { ...toTimelineFilter(filters), order: filters.order, limit: PAGE_SIZE }
}

export const todayKey = (now: Date = new Date()): string => localDateKey(now)
