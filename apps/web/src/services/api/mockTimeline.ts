// 개발 전용 Mock 구현. 운영 빌드에는 포함되지 않는다. (mock.ts 에서만 불러온다)
import {
  ATTENTION_FROM,
  type TimelineDetailResponse,
  type TimelineEvent,
  type TimelineFilter,
  type TimelineOrder,
  type TimelineQuery,
  type TimelineResponse,
  type TimelineSummaryResponse,
} from '@tetris/shared'
import { ApiError } from '../apiClient'
import type { Mocked, TimelineApi } from './types'
import { MOCK_ADAPTER_SENTINEL } from './mock'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 서버(TimelineService)와 같은 규칙으로 조건에 맞는 이벤트만 남긴다. */
export function matchesFilter(event: TimelineEvent, filter: TimelineFilter): boolean {
  const at = Date.parse(event.occurredAt)
  if (filter.from && at < Date.parse(filter.from)) return false
  if (filter.to && at > Date.parse(filter.to)) return false
  if (filter.sensorId && event.sensorId !== filter.sensorId) return false
  if (filter.type && event.eventType !== filter.type) return false
  if (filter.attention && event.attention !== filter.attention) return false
  if (filter.alert && event.alertRaised !== (filter.alert === 'true')) return false
  return true
}

function sorted(events: readonly TimelineEvent[], order: TimelineOrder): TimelineEvent[] {
  const asc = [...events].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.id < b.id ? -1 : 1),
  )
  return order === 'asc' ? asc : asc.reverse()
}

const encode = (event: TimelineEvent): string => btoa(`${Date.parse(event.occurredAt)}:${event.id}`)

/** 정렬된 목록에서 cursor 다음부터 limit 건을 돌려준다. (서버와 같은 "다음 쪽" 계약) */
export function pageOf(
  events: readonly TimelineEvent[],
  query: Pick<TimelineQuery, 'order' | 'limit' | 'cursor'>,
): TimelineResponse {
  const ordered = sorted(events, query.order ?? 'desc')
  const start = query.cursor ? ordered.findIndex((event) => encode(event) === query.cursor) + 1 : 0
  const limit = Number(query.limit ?? 30)
  const page = ordered.slice(start, start + limit)
  const last = page.at(-1)
  return {
    events: page,
    nextCursor: last && start + limit < ordered.length ? encode(last) : null,
  }
}

export function summarize(
  events: readonly TimelineEvent[],
  generatedAt: Date,
): TimelineSummaryResponse {
  const latest = sorted(events, 'desc')[0]
  return {
    total: events.length,
    attention: events.filter((event) => ATTENTION_FROM.includes(event.attention)).length,
    alertRaised: events.filter((event) => event.alertRaised).length,
    lastEventAt: latest?.occurredAt ?? null,
    generatedAt: generatedAt.toISOString(),
  }
}

/**
 * 움직임 기록을 서버 없이 미리 볼 수 있는 예시 데이터. 실제 센서·기록이 아니다.
 * 센서 이름에 "(샘플)"을 붙이고 출처를 시뮬레이션으로 두어, 화면 어디에서도 실제 기록처럼 보이지 않는다.
 * 최근 10일에 걸쳐 여섯 가지 이벤트 유형이 모두 나오도록 정해진 규칙으로 만든다. (무작위 없음)
 */
export function createMockTimelineEvents(now: Date): TimelineEvent[] {
  const iso = (ms: number) => new Date(ms).toISOString()
  const sensors = {
    BED_SIDE: { id: 'mock-bed_side', name: '(샘플) 침대 주변 센서' },
    PATH: { id: 'mock-path', name: '(샘플) 이동 경로 센서' },
    ENTRANCE: { id: 'mock-entrance', name: '(샘플) 현관 센서' },
  } as const
  const base = {
    receivedAtOffset: 1000,
    origin: 'SIMULATED' as const,
    isLate: false,
  }
  const events: TimelineEvent[] = []
  let serial = 0

  const movement = (
    zone: keyof typeof sensors,
    type: 'BED_EXIT_CANDIDATE' | 'MOTION_DETECTED' | 'ENTRANCE_ACTIVITY',
    at: number,
    options: {
      attention?: TimelineEvent['attention']
      /** 같은 key 의 알림은 같은 알림이다. (한 알림의 근거가 된 여러 신호) */
      alert?: {
        key: string
        type: TimelineEvent['alerts'][number]['type']
        severity: 'INFO' | 'NOTICE' | 'URGENT'
      }
    } = {},
  ) => {
    serial += 1
    const alerts = options.alert
      ? [
          {
            id: `mock-alert-${options.alert.key}`,
            type: options.alert.type,
            severity: options.alert.severity,
            status: 'RESOLVED' as const,
          },
        ]
      : []
    events.push({
      id: `mov_mock-${serial}`,
      sensorId: sensors[zone].id,
      sensorName: sensors[zone].name,
      eventType: type,
      zone,
      origin: base.origin,
      occurredAt: iso(at),
      receivedAt: iso(at + base.receivedAtOffset),
      isLate: base.isLate,
      attention: options.attention ?? 'NORMAL',
      alertRaised: alerts.length > 0,
      alerts,
      description:
        type === 'MOTION_DETECTED'
          ? '예시 데이터: 움직임 신호가 있었습니다.'
          : '예시 데이터: 센서 위치와 규칙에 따른 추정이며 실제 상황을 확정하지 않습니다.',
      rule: alerts[0]
        ? { alertType: alerts[0].type, text: '예시 데이터의 규칙 설명입니다.' }
        : {
            alertType: null,
            text: '이 신호 하나는 알림 규칙에 해당하지 않아 기록으로만 남습니다.',
          },
    })
  }
  const status = (
    zone: keyof typeof sensors,
    type: 'SENSOR_OFFLINE' | 'SENSOR_RESTORED' | 'LOW_BATTERY',
    at: number,
    attention: TimelineEvent['attention'],
    withAlert: boolean,
  ) => {
    serial += 1
    events.push({
      id: `sta_mock-${serial}`,
      sensorId: sensors[zone].id,
      sensorName: sensors[zone].name,
      eventType: type,
      zone,
      origin: base.origin,
      occurredAt: iso(at),
      receivedAt: iso(at),
      isLate: false,
      attention,
      alertRaised: withAlert,
      alerts: withAlert
        ? [
            {
              id: `mock-alert-${serial}`,
              type: type === 'LOW_BATTERY' ? 'LOW_BATTERY' : 'SENSOR_OFFLINE',
              severity: attention === 'NORMAL' ? 'INFO' : attention === 'INFO' ? 'INFO' : 'NOTICE',
              status: 'RESOLVED',
            },
          ]
        : [],
      description: '예시 데이터: 센서 상태가 바뀌었습니다.',
      rule: { alertType: null, text: '예시 데이터의 규칙 설명입니다.' },
    })
  }

  const t = now.getTime()
  for (let day = 0; day < 10; day += 1) {
    const start = t - day * DAY
    movement('BED_SIDE', 'MOTION_DETECTED', start - 9 * HOUR - day * MINUTE)
    movement('PATH', 'MOTION_DETECTED', start - 8 * HOUR - 30 * MINUTE)
    if (day % 2 === 0) movement('ENTRANCE', 'ENTRANCE_ACTIVITY', start - 6 * HOUR)
    if (day % 3 === 1) {
      const alert = { key: `bed-${day}`, type: 'BED_TO_PATH', severity: 'NOTICE' } as const
      movement('BED_SIDE', 'BED_EXIT_CANDIDATE', start - 3 * HOUR - 10 * MINUTE, {
        attention: 'NOTICE',
        alert,
      })
      movement('PATH', 'BED_EXIT_CANDIDATE', start - 3 * HOUR, { attention: 'NOTICE', alert })
    }
  }
  movement('ENTRANCE', 'ENTRANCE_ACTIVITY', t - 20 * MINUTE, {
    attention: 'URGENT',
    alert: { key: 'entrance', type: 'ENTRANCE_APPROACH', severity: 'URGENT' },
  })
  status('PATH', 'LOW_BATTERY', t - 2 * DAY - HOUR, 'INFO', true)
  status('PATH', 'SENSOR_OFFLINE', t - 4 * DAY - 2 * HOUR, 'NOTICE', true)
  status('PATH', 'SENSOR_RESTORED', t - 4 * DAY - HOUR, 'NORMAL', false)
  return events
}

const notFound = () =>
  new ApiError({
    kind: 'http',
    status: 404,
    code: 'NOT_FOUND',
    message: '기록을 찾을 수 없습니다.',
  })

const mocked = <T extends object>(body: T): Mocked<T> => ({
  ...body,
  mock: true,
  mockSource: MOCK_ADAPTER_SENTINEL,
})

/** 서버와 같은 계약(조건·정렬·cursor·요약·상세)을 메모리에서 흉내 낸다. 새로고침하면 처음으로 돌아간다. */
export function createMockTimelineApi(now: () => Date = () => new Date()): TimelineApi {
  const events = createMockTimelineEvents(now())
  return {
    list: (query) =>
      Promise.resolve(
        mocked(
          pageOf(
            events.filter((event) => matchesFilter(event, query)),
            query,
          ),
        ),
      ),
    summary: (filter) =>
      Promise.resolve(
        mocked(
          summarize(
            events.filter((event) => matchesFilter(event, filter)),
            now(),
          ),
        ),
      ),
    get: (id): Promise<Mocked<TimelineDetailResponse>> => {
      const event = events.find((item) => item.id === id)
      if (!event) return Promise.reject(notFound())
      const relatedIds = new Set(event.alerts.map((alert) => alert.id))
      const relatedEvents = events
        .filter(
          (other) =>
            other.id !== id &&
            other.id.startsWith('mov_') &&
            other.alerts.some((alert) => relatedIds.has(alert.id)),
        )
        .map(({ id: otherId, sensorName, zone, occurredAt }) => ({
          id: otherId,
          sensorName,
          zone,
          occurredAt,
        }))
      return Promise.resolve(mocked({ event, relatedEvents }))
    },
  }
}
