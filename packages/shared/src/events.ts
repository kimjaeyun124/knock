import { z } from './zod'
import { DataOriginSchema, ZoneKindSchema } from './domain'

export const MovementEventSchema = z.object({
  id: z.string(),
  sensorId: z.string(),
  sensorName: z.string(),
  /** 이벤트가 기록된 시점의 센서 구역 */
  zone: ZoneKindSchema,
  origin: DataOriginSchema,
  occurredAt: z.iso.datetime(),
  receivedAt: z.iso.datetime(),
  /** 발생보다 크게 늦게 도착한 이벤트 */
  isLate: z.boolean(),
})
export type MovementEvent = z.infer<typeof MovementEventSchema>

export const EVENTS_MAX_LIMIT = 200

/** GET /api/events 쿼리. 최신순으로 돌려주며 cursor 로 다음 쪽을 요청한다. */
export const EventsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  zone: ZoneKindSchema.optional(),
  sensorId: z.string().min(1).optional(),
  origin: DataOriginSchema.optional(),
  limit: z.coerce.number().int().min(1).max(EVENTS_MAX_LIMIT).default(50),
  cursor: z.string().min(1).optional(),
})
export type EventsQuery = z.input<typeof EventsQuerySchema>

export const EventsResponseSchema = z.object({
  events: z.array(MovementEventSchema),
  /** 다음 쪽이 없으면 null */
  nextCursor: z.string().nullable(),
})
export type EventsResponse = z.infer<typeof EventsResponseSchema>

export const DAILY_SUMMARY_MAX_DAYS = 31

/** GET /api/events/daily 쿼리. 오늘(한국 시간)을 포함한 최근 N일. */
export const DailySummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(DAILY_SUMMARY_MAX_DAYS).default(7),
})
export type DailySummaryQuery = z.input<typeof DailySummaryQuerySchema>

export const DailySummaryDaySchema = z.object({
  /** 한국 시간 기준 날짜 (YYYY-MM-DD) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 그날 감지된 움직임 신호 수 (시뮬레이션 포함) */
  movements: z.number().int().nonnegative(),
  /** 그중 시뮬레이션으로 만들어진 신호 수 */
  simulatedMovements: z.number().int().nonnegative(),
  /** 그날 만들어진 움직임 알림(주의·긴급) 수. 센서 상태·전달 실패 알림은 세지 않는다. */
  attentionAlerts: z.number().int().nonnegative(),
})
export type DailySummaryDay = z.infer<typeof DailySummaryDaySchema>

export const DailySummaryResponseSchema = z.object({
  /** 오래된 날부터 오늘까지 빠짐없이 (기록이 없는 날은 0건) */
  days: z.array(DailySummaryDaySchema),
  generatedAt: z.iso.datetime(),
})
export type DailySummaryResponse = z.infer<typeof DailySummaryResponseSchema>
