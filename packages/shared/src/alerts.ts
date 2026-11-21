import { z } from './zod'
import {
  AlertSeveritySchema,
  AlertStatusSchema,
  AlertTypeSchema,
  ChannelSchema,
  type Channel,
  type DeliveryStatus,
  DataOriginSchema,
  DeliveryStatusSchema,
  ProviderModeSchema,
  ResolutionSchema,
  ZoneKindSchema,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  type AlertSeverity,
} from './domain'

/** 심각도 순서: INFO < NOTICE < URGENT */
export function severityRank(severity: AlertSeverity): number {
  return ALERT_SEVERITIES.indexOf(severity)
}

/**
 * 알림 하나의 전달 결과 요약.
 * 연동되지 않은 채널(notConfigured)은 "전달되지 않았다"는 사실을 숨기지 않기 위해 따로 센다.
 */
export const DeliverySummarySchema = z.object({
  sent: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  notConfigured: z.number().int().nonnegative(),
})
export type DeliverySummary = z.infer<typeof DeliverySummarySchema>

/**
 * 알림 전달 상태(화면용). 서버가 알 수 있는 범위에서만 구분한다.
 *  WAITING    대기: 아직 보내지 않음
 *  ATTEMPTING 전송 시도: 시도했고 다시 시도할 예정
 *  SENT       전송 성공: 열려 있는 앱 화면에 보냄
 *  UNVERIFIED 전달 확인 불가: 푸시·문자 등 외부 서비스에 넘겼지만 기기에 도착했는지는 알 수 없음
 *  FAILED     전송 실패: 모든 시도가 실패함
 * 실제 기기 수신을 확인할 수 없는 채널을 "전송 성공"으로 보이지 않게 하는 것이 목적이다.
 * 연동되지 않았거나(NOT_CONFIGURED) 확인·종료로 멈춘(CANCELLED) 전달은 이 상태에 속하지 않는다(null).
 */
export const DELIVERY_DISPLAY_STATES = [
  'WAITING',
  'ATTEMPTING',
  'SENT',
  'UNVERIFIED',
  'FAILED',
] as const
export const DeliveryDisplayStateSchema = z.enum(DELIVERY_DISPLAY_STATES)
export type DeliveryDisplayState = z.infer<typeof DeliveryDisplayStateSchema>

/** 전달 기록 하나의 화면용 상태 */
export function classifyDelivery(input: {
  channel: Channel
  status: DeliveryStatus
  attempts: number
}): DeliveryDisplayState | null {
  switch (input.status) {
    case 'PENDING':
      return input.attempts > 0 ? 'ATTEMPTING' : 'WAITING'
    case 'SENT':
      // 앱 화면 알림만 "열려 있는 화면에 보냈다"는 것을 서버가 안다. 나머지는 외부 서비스에 넘긴 것까지만 안다.
      return input.channel === 'IN_APP' ? 'SENT' : 'UNVERIFIED'
    case 'FAILED':
      return 'FAILED'
    case 'NOT_CONFIGURED':
    case 'CANCELLED':
      return null
  }
}

/** 여러 채널의 전달을 알림 하나의 상태로 합친다. 가장 "도착에 가까운" 상태를 대표로 쓴다. */
export function aggregateDeliveryState(
  states: readonly (DeliveryDisplayState | null)[],
): DeliveryDisplayState | null {
  for (const state of ['SENT', 'UNVERIFIED', 'ATTEMPTING', 'WAITING', 'FAILED'] as const) {
    if (states.includes(state)) return state
  }
  return null
}

export const AlertSchema = z.object({
  id: z.string(),
  type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  origin: DataOriginSchema,
  /** 사용자에게 보이는 문장. 확정적 표현을 쓰지 않는다. */
  title: z.string(),
  message: z.string(),
  sensorId: z.string().nullable(),
  sensorName: z.string().nullable(),
  triggeredAt: z.iso.datetime(),
  /** 이 알림에 합쳐진 마지막 신호 시각 */
  lastEventAt: z.iso.datetime(),
  /** 반복 억제로 합쳐진 신호 수 */
  occurrences: z.number().int().positive(),
  acknowledgedAt: z.iso.datetime().nullable(),
  acknowledgedByName: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  resolution: ResolutionSchema.nullable(),
  note: z.string().nullable(),
  /** 긴급 알림을 확인하지 않아 다시 알린 횟수 */
  reminderCount: z.number().int().nonnegative(),
  delivery: DeliverySummarySchema,
  /** 알림 하나의 전달 상태(대표 값). 전달 대상이 없으면(정보 수준 등) null */
  deliveryState: DeliveryDisplayStateSchema.nullable(),
  /**
   * 이 알림과 관련된 움직임 기록 ID (움직임 기록의 이벤트 ID, 최신순 최대 5개).
   * 움직임 알림은 근거가 된 신호(mov_…), 센서 알림은 그 상태 변화(sta_…)다. 없으면 빈 배열.
   */
  relatedEventIds: z.array(z.string()),
})
export type Alert = z.infer<typeof AlertSchema>

/**
 * 읽는 보호자 기준의 알림. `read` 는 보호자마다 다르므로 모든 화면에 뿌리는 실시간 알림(Alert)에는 없고,
 * 목록·상세·읽음 처리 응답에만 있다.
 * 읽음은 "알림을 봤다"는 표시일 뿐이며, 처리 상태(status)나 실제 상황의 해결과 별개다.
 */
export const AlertItemSchema = AlertSchema.extend({ read: z.boolean() })
export type AlertItem = z.infer<typeof AlertItemSchema>

export const AlertDeliverySchema = z.object({
  id: z.string(),
  guardianId: z.string(),
  guardianName: z.string(),
  channel: ChannelSchema,
  /** REAL: 실제 연동 / MOCK: 가짜 응답 / null: 연동되지 않음 */
  providerMode: ProviderModeSchema.nullable(),
  status: DeliveryStatusSchema,
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  sentAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type AlertDelivery = z.infer<typeof AlertDeliverySchema>

export const AlertEvidenceSchema = z.object({
  eventId: z.string(),
  sensorName: z.string(),
  zone: ZoneKindSchema,
  occurredAt: z.iso.datetime(),
  isLate: z.boolean(),
})
export type AlertEvidence = z.infer<typeof AlertEvidenceSchema>

export const AlertDetailSchema = z.object({
  alert: AlertItemSchema,
  /** 이 알림의 근거가 된 움직임 신호 (오래된 순) */
  evidence: z.array(AlertEvidenceSchema),
  deliveries: z.array(AlertDeliverySchema),
})
export type AlertDetail = z.infer<typeof AlertDetailSchema>

export const ALERTS_MAX_LIMIT = 100

/** 쉼표로 구분한 상태 목록 (예: `OPEN,ACKNOWLEDGED`) */
const StatusListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(AlertStatusSchema).min(1).max(ALERT_STATUSES.length))

export const AlertsQuerySchema = z.object({
  status: StatusListSchema.optional(),
  type: AlertTypeSchema.optional(),
  origin: DataOriginSchema.optional(),
  /** 'true': 내가 읽지 않은 알림만 */
  unread: z.literal('true').optional(),
  /** 'true': 중요 알림만 (심각도 "확인 필요" 이상) */
  important: z.literal('true').optional(),
  limit: z.coerce.number().int().min(1).max(ALERTS_MAX_LIMIT).default(30),
  cursor: z.string().min(1).optional(),
})
export type AlertsQuery = z.input<typeof AlertsQuerySchema>

export const AlertListResponseSchema = z.object({
  alerts: z.array(AlertItemSchema),
  nextCursor: z.string().nullable(),
})
export type AlertListResponse = z.infer<typeof AlertListResponseSchema>

export const AlertResponseSchema = z.object({ alert: AlertItemSchema })
export type AlertResponse = z.infer<typeof AlertResponseSchema>

export const AlertDetailResponseSchema = AlertDetailSchema
export type AlertDetailResponse = AlertDetail

/** 사람이 알림을 종료할 때 고르는 결과. AUTO_RESOLVED 는 시스템만 쓴다. */
export const AlertResolveRequestSchema = z.object({
  resolution: z.enum(['CHECKED', 'FALSE_ALARM']),
  note: z.string().trim().max(500).optional(),
})
export type AlertResolveRequest = z.infer<typeof AlertResolveRequestSchema>

/** 중요 알림: 심각도가 "확인 필요(NOTICE)" 이상 */
export const IMPORTANT_SEVERITIES: readonly AlertSeverity[] = ['NOTICE', 'URGENT']

/** GET /api/alerts/unread-count — 내가 읽지 않은 알림 수 (처리 상태와 상관없이 센다) */
export const AlertUnreadCountResponseSchema = z.object({
  unread: z.number().int().nonnegative(),
  /** 그중 중요 알림 수 */
  unreadImportant: z.number().int().nonnegative(),
})
export type AlertUnreadCountResponse = z.infer<typeof AlertUnreadCountResponseSchema>

/** POST /api/alerts/read-all */
export const AlertReadAllResponseSchema = z.object({
  /** 이번에 새로 읽음 처리된 알림 수 */
  updated: z.number().int().nonnegative(),
})
export type AlertReadAllResponse = z.infer<typeof AlertReadAllResponseSchema>
