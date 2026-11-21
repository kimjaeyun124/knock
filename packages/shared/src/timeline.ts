import { z } from './zod'
import {
  AlertSeveritySchema,
  AlertStatusSchema,
  AlertTypeSchema,
  DataOriginSchema,
  ZoneKindSchema,
} from './domain'

/**
 * 움직임 기록(타임라인)의 이벤트 유형.
 *  BED_EXIT_CANDIDATE          : 침대 주변 규칙(침대 주변 움직임·침대→이동 경로)이 근거로 쓴 움직임 — 센서 위치와 규칙에 따른 **추정**
 *  MOTION_DETECTED   : 일반 움직임 신호
 *  ENTRANCE_ACTIVITY : 현관 센서의 움직임 신호 — 현관 주변 움직임의 **추정**이며 외출을 뜻하지 않는다
 *  SENSOR_OFFLINE    : 센서 연결 끊김
 *  SENSOR_RESTORED   : 센서 연결 복구
 *  LOW_BATTERY       : 배터리 부족·위급
 * 단일 움직임 센서의 신호만으로 낙상이나 외출을 확정 판정하지 않는다.
 */
export const TIMELINE_EVENT_TYPES = [
  'BED_EXIT_CANDIDATE',
  'MOTION_DETECTED',
  'ENTRANCE_ACTIVITY',
  'SENSOR_OFFLINE',
  'SENSOR_RESTORED',
  'LOW_BATTERY',
] as const
export const TimelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES)
export type TimelineEventType = z.infer<typeof TimelineEventTypeSchema>

/** 움직임 신호 유형(센서 상태 이벤트가 아닌 것) */
export const MOVEMENT_EVENT_TYPES = [
  'BED_EXIT_CANDIDATE',
  'MOTION_DETECTED',
  'ENTRANCE_ACTIVITY',
] as const

/**
 * 움직임 신호 한 건의 분류. 신호를 받을 때 판단 엔진이 정해 DB 에 저장한다. (apps/server/src/domain/rules/classify.ts)
 * 타임라인의 움직임 유형과 같은 값이다.
 */
export const MOVEMENT_CLASSES = MOVEMENT_EVENT_TYPES
export type MovementClass = (typeof MOVEMENT_CLASSES)[number]

/** 주의 수준. NORMAL 은 알림과 무관한 일반 기록이다. INFO < NOTICE < URGENT 는 알림 심각도와 같다. */
export const TIMELINE_ATTENTION_LEVELS = ['NORMAL', 'INFO', 'NOTICE', 'URGENT'] as const
export const TimelineAttentionSchema = z.enum(TIMELINE_ATTENTION_LEVELS)
export type TimelineAttention = z.infer<typeof TimelineAttentionSchema>

/** 주의 이벤트: 알림 심각도 "주의" 이상 */
export const ATTENTION_FROM: readonly TimelineAttention[] = ['NOTICE', 'URGENT']

export const TIMELINE_ORDERS = ['desc', 'asc'] as const
export const TimelineOrderSchema = z.enum(TIMELINE_ORDERS)
export type TimelineOrder = z.infer<typeof TimelineOrderSchema>

export const TIMELINE_MAX_LIMIT = 100
export const TIMELINE_DEFAULT_LIMIT = 30

export const TimelineAlertRefSchema = z.object({
  id: z.string(),
  type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
})
export type TimelineAlertRef = z.infer<typeof TimelineAlertRefSchema>

export const TimelineEventSchema = z.object({
  /** 이벤트 ID. 움직임 신호는 mov_…, 센서 상태 변화는 sta_… 로 시작한다. */
  id: z.string(),
  sensorId: z.string(),
  sensorName: z.string(),
  eventType: TimelineEventTypeSchema,
  /** 움직임은 그 시점의 센서 구역, 센서 상태 이벤트는 센서의 현재 구역 */
  zone: ZoneKindSchema,
  origin: DataOriginSchema,
  /** 발생 시각 (ISO 8601, UTC). 화면에서 보는 사람의 시간대로 바꿔 보여 준다. */
  occurredAt: z.iso.datetime(),
  /** 서버가 받은 시각. 센서 상태 이벤트는 서버가 만든 시각이라 발생 시각과 같다. */
  receivedAt: z.iso.datetime(),
  /** 발생보다 크게 늦게 도착한 신호 */
  isLate: z.boolean(),
  attention: TimelineAttentionSchema,
  /** 이 이벤트와 연결된 알림이 있는가 */
  alertRaised: z.boolean(),
  alerts: z.array(TimelineAlertRefSchema),
  /** 사용자에게 보이는 설명. 추정 이벤트는 추정이라고 밝히고 상황을 단정하지 않는다. */
  description: z.string(),
  /** 판단에 사용된 규칙. alertType 이 null 이면 알림 규칙에 해당하지 않는 기록이다. (설명은 현재 설정 기준) */
  rule: z.object({ text: z.string(), alertType: AlertTypeSchema.nullable() }),
})
export type TimelineEvent = z.infer<typeof TimelineEventSchema>

const isoWithOffset = z.iso.datetime({ offset: true })

/** 조건 쿼리. 비어 있는 항목은 "전체"다. */
export const TimelineFilterSchema = z.object({
  from: isoWithOffset.optional(),
  to: isoWithOffset.optional(),
  sensorId: z.string().min(1).optional(),
  type: TimelineEventTypeSchema.optional(),
  attention: TimelineAttentionSchema.optional(),
  /** 'true': 알림이 발생한 기록만, 'false': 알림이 없는 기록만 */
  alert: z.enum(['true', 'false']).optional(),
})
export type TimelineFilter = z.input<typeof TimelineFilterSchema>

/** GET /api/timeline 쿼리. cursor 로 다음 쪽을 요청한다. */
export const TimelineQuerySchema = TimelineFilterSchema.extend({
  order: TimelineOrderSchema.default('desc'),
  limit: z.coerce.number().int().min(1).max(TIMELINE_MAX_LIMIT).default(TIMELINE_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
})
export type TimelineQuery = z.input<typeof TimelineQuerySchema>

export const TimelineResponseSchema = z.object({
  events: z.array(TimelineEventSchema),
  /** 다음 쪽이 없으면 null */
  nextCursor: z.string().nullable(),
})
export type TimelineResponse = z.infer<typeof TimelineResponseSchema>

/** GET /api/timeline/summary — 같은 조건 전체에 대한 요약(한 쪽이 아니라) */
export const TimelineSummaryResponseSchema = z.object({
  /** 전체 감지 건수 (움직임 + 센서 상태 이벤트) */
  total: z.number().int().nonnegative(),
  /** 주의 이벤트: 주의 수준이 "주의" 이상인 기록 */
  attention: z.number().int().nonnegative(),
  /** 알림이 발생한 기록 수 */
  alertRaised: z.number().int().nonnegative(),
  /** 조건에 맞는 가장 최근 이벤트의 발생 시각. 없으면 null */
  lastEventAt: z.iso.datetime().nullable(),
  generatedAt: z.iso.datetime(),
})
export type TimelineSummaryResponse = z.infer<typeof TimelineSummaryResponseSchema>

export const TimelineRelatedEventSchema = z.object({
  id: z.string(),
  sensorName: z.string(),
  zone: ZoneKindSchema,
  occurredAt: z.iso.datetime(),
})
export type TimelineRelatedEvent = z.infer<typeof TimelineRelatedEventSchema>

/** GET /api/timeline/:id */
export const TimelineDetailResponseSchema = z.object({
  event: TimelineEventSchema,
  /** 같은 알림의 근거로 함께 쓰인 다른 움직임 신호 (시각 순, 최대 20건) */
  relatedEvents: z.array(TimelineRelatedEventSchema),
})
export type TimelineDetailResponse = z.infer<typeof TimelineDetailResponseSchema>
