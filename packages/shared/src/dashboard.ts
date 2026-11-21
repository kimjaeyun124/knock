import { z } from './zod'
import { AlertSchema, type Alert } from './alerts'
import {
  DailySummaryDaySchema,
  MovementEventSchema,
  type DailySummaryDay,
  type MovementEvent,
} from './events'
import { SensorSchema, type Sensor } from './sensors'
import type { DetectionSettings } from './settings'

/** 대시보드에 보여 주는 "최근 움직임" 개수 */
export const DASHBOARD_RECENT_EVENTS = 5
/** 대시보드의 날짜별 요약 기간(일) */
export const DASHBOARD_WEEKLY_DAYS = 7

/**
 * 대시보드 한 화면이 필요로 하는 데이터. 화면은 이 형태만 안다.
 * 서버가 GET /api/v1/dashboard/summary 로 한 번에 이 응답을 준다. 웹은 그 응답을 이 스키마로 검증해 쓴다.
 *
 * 개수(연결된 센서 수 등)는 여기 담지 않는다. 원본 목록에서 화면이 계산해, 같은 값이 두 곳에 있어 어긋나는 일이 없게 한다.
 */
export const DashboardSummarySchema = z.object({
  /** 이 요약을 만든 시각. 화면의 "마지막 업데이트" */
  generatedAt: z.iso.datetime(),
  /** 야간 모니터링 시간대 (Asia/Seoul, HH:mm). 종료가 시작보다 이르면 자정을 넘는다. */
  schedule: z.object({
    /** 모니터링(움직임 알림 판단) 사용 여부 */
    monitoringEnabled: z.boolean(),
    /** 모니터링하는 요일(0=월 … 6=일). 야간 구간이 시작되는 날 기준 */
    activeWeekdays: z.array(z.number().int().min(0).max(6)),
    nightStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    nightEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }),
  /** 가장 먼저 등록한 센서의 등록 시각. 센서가 없으면 null. 별도의 "모니터링 시작" 기록은 없다. */
  monitoringStartedAt: z.iso.datetime().nullable(),
  /** 센서들이 마지막으로 신호를 보낸 가장 최근 시각. 한 번도 없으면 null. */
  lastDataAt: z.iso.datetime().nullable(),
  sensors: z.array(SensorSchema),
  /** 아직 종료되지 않은 알림 (진행 중 + 확인함) */
  activeAlerts: z.array(AlertSchema),
  /** 가장 최근 움직임 신호 (최신순, 최대 DASHBOARD_RECENT_EVENTS 건) */
  recentEvents: z.array(MovementEventSchema),
  /** 오래된 날부터 오늘까지, 기록이 없는 날도 0건으로 */
  weekly: z.array(DailySummaryDaySchema),
})
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>

/** GET /api/v1/dashboard/summary 의 응답. v1 공통 형태 { data, meta? } 중 웹이 쓰는 부분 */
export const DashboardSummaryResponseSchema = z.object({ data: DashboardSummarySchema })
export type DashboardSummaryResponse = z.infer<typeof DashboardSummaryResponseSchema>

export interface DashboardParts {
  now: Date
  sensors: readonly Sensor[]
  recentEvents: readonly MovementEvent[]
  activeAlerts: readonly Alert[]
  settings: Pick<
    DetectionSettings,
    'nightStart' | 'nightEnd' | 'monitoringEnabled' | 'activeWeekdays'
  >
  weekly: readonly DailySummaryDay[]
}

function extreme(values: readonly (string | null)[], pick: 'min' | 'max'): string | null {
  let result: string | null = null
  for (const value of values) {
    if (value === null) continue
    if (result === null || (pick === 'min' ? value < result : value > result)) result = value
  }
  return result
}

/**
 * 여러 조회 결과를 대시보드 한 화면용 데이터로 합친다. (순수 함수)
 * 서버의 DashboardService 와 웹 테스트의 가짜 서버가 같은 함수를 쓴다.
 */
export function buildDashboardSummary(parts: DashboardParts): DashboardSummary {
  const active = parts.sensors.filter((sensor) => sensor.isActive)
  return {
    generatedAt: parts.now.toISOString(),
    schedule: {
      monitoringEnabled: parts.settings.monitoringEnabled,
      activeWeekdays: parts.settings.activeWeekdays,
      nightStart: parts.settings.nightStart,
      nightEnd: parts.settings.nightEnd,
    },
    monitoringStartedAt: extreme(
      active.map((sensor) => sensor.createdAt),
      'min',
    ),
    lastDataAt: extreme(
      active.map((sensor) => sensor.lastSeenAt),
      'max',
    ),
    sensors: [...parts.sensors],
    activeAlerts: [...parts.activeAlerts],
    recentEvents: parts.recentEvents.slice(0, DASHBOARD_RECENT_EVENTS),
    weekly: [...parts.weekly],
  }
}
