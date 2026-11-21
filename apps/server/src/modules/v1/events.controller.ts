import { Router } from 'express'
import { z } from 'zod'
import {
  DAILY_SUMMARY_MAX_DAYS,
  DataOriginSchema,
  EVENTS_MAX_LIMIT,
  ZoneKindSchema,
} from '@tetris/shared'
import type { Services } from '@/container'
import { getAuth } from '@/middleware/require-auth'
import { AppError } from '@/utils/errors'
import { DateRangeSchema, IdParamSchema, OrderSchema, pageMeta, sendData } from './http'

const ListQuerySchema = z
  .object({
    zone: ZoneKindSchema.optional(),
    origin: DataOriginSchema.optional(),
    sensorId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(EVENTS_MAX_LIMIT).default(50),
    cursor: z.string().min(1).max(500).optional(),
    /** 발생 시각 기준 정렬. 기본은 최신순 */
    order: OrderSchema.default('desc'),
  })
  .and(DateRangeSchema)

const SummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(DAILY_SUMMARY_MAX_DAYS).default(7),
})

/** /api/v1/events */
export function createEventsController(services: Services): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const query = ListQuerySchema.parse(req.query)
    const { events, nextCursor } = await services.events.list(getAuth(res).householdId, query)
    sendData(res, events, { meta: pageMeta(query.limit, nextCursor) })
  })

  // 날짜별 집계. ':id' 보다 먼저 둔다.
  router.get('/summary', async (req, res) => {
    const { days } = SummaryQuerySchema.parse(req.query)
    const summary = await services.events.dailySummary(getAuth(res).householdId, days)
    const totals = summary.days.reduce(
      (sum, day) => ({
        movements: sum.movements + day.movements,
        simulatedMovements: sum.simulatedMovements + day.simulatedMovements,
        attentionAlerts: sum.attentionAlerts + day.attentionAlerts,
      }),
      { movements: 0, simulatedMovements: 0, attentionAlerts: 0 },
    )
    sendData(res, { ...summary, totals })
  })

  router.get('/:id', async (req, res) => {
    const { id } = IdParamSchema.parse(req.params)
    const event = await services.events.get(getAuth(res).householdId, id)
    if (!event) throw AppError.notFound('움직임 기록을 찾을 수 없습니다.')
    sendData(res, event)
  })

  return router
}
