import { z } from './zod'
import { SensorKindSchema } from './domain'

/**
 * 장치 → 서버 수집 계약 v1. 자세한 설명은 docs/INGEST_CONTRACT.md.
 * 서버와 시뮬레이터가 같은 값을 쓴다.
 */
export const INGEST_LIMITS = {
  /** 한 번에 보낼 수 있는 이벤트 수 */
  maxEventsPerRequest: 100,
  /** 서버 시각보다 이만큼 이상 미래인 발생 시각은 거부 (장치 시계 오류) */
  futureToleranceSeconds: 60,
  /** 이보다 오래된 이벤트는 거부 */
  maxEventAgeHours: 24,
  /** 발생 후 이만큼 이상 늦게 도착하면 "지연 수신"으로 표시 */
  lateEventSeconds: 120,
  /** 센서 하나가 1분에 보낼 수 있는 요청 수 */
  requestsPerMinutePerSensor: 120,
} as const

/** 장치 토큰 접두사. 코드 저장소나 로그에 섞여 들어갔을 때 알아보기 쉽게 한다. */
export const DEVICE_TOKEN_PREFIX = 'tsn_'

export const IngestEventSchema = z.object({
  /** 장치가 만드는 고유 ID(UUID 권장). 같은 ID를 다시 보내도 한 번만 저장된다. */
  eventId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, '8~64자의 영문·숫자·-·_ 만 쓸 수 있습니다.'),
  type: SensorKindSchema,
  /** 발생 시각(ISO 8601). 시계가 없는 장치는 생략할 수 있으며, 그러면 서버가 받은 시각을 쓴다. */
  occurredAt: z.iso.datetime({ offset: true }).optional(),
})
export type IngestEvent = z.infer<typeof IngestEventSchema>

export const IngestEventsRequestSchema = z.object({
  events: z.array(IngestEventSchema).min(1).max(INGEST_LIMITS.maxEventsPerRequest),
})
export type IngestEventsRequest = z.infer<typeof IngestEventsRequestSchema>

export const INGEST_REJECT_REASONS = ['FUTURE_TIMESTAMP', 'TOO_OLD', 'TYPE_MISMATCH'] as const

export const IngestEventResultSchema = z.object({
  eventId: z.string(),
  /** ACCEPTED: 저장됨 / DUPLICATE: 이미 받은 이벤트(다시 보내지 않아도 됨) / REJECTED: 영구 거부(다시 보내도 같음) */
  status: z.enum(['ACCEPTED', 'DUPLICATE', 'REJECTED']),
  reason: z.enum(INGEST_REJECT_REASONS).optional(),
})
export type IngestEventResult = z.infer<typeof IngestEventResultSchema>

export const IngestEventsResponseSchema = z.object({
  /** 장치가 시계를 맞추는 데 쓸 수 있는 서버 시각 */
  serverTime: z.iso.datetime(),
  results: z.array(IngestEventResultSchema),
})
export type IngestEventsResponse = z.infer<typeof IngestEventsResponseSchema>

export const HeartbeatRequestSchema = z.object({
  batteryPercent: z.number().int().min(0).max(100).optional(),
  firmware: z.string().trim().min(1).max(32).optional(),
})
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>

export const HeartbeatResponseSchema = z.object({ serverTime: z.iso.datetime() })
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>
