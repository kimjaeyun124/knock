import { Router } from 'express'
import { DailySummaryQuerySchema, EventsQuerySchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

export function createEventsRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', async (req, res) => {
    const filter = EventsQuerySchema.parse(req.query)
    res.json(await services.events.list(getAuth(res).householdId, filter))
  })

  // 날짜별 집계. ':id' 같은 경로보다 먼저 두어야 한다.
  router.get('/daily', async (req, res) => {
    const { days } = DailySummaryQuerySchema.parse(req.query)
    res.json(await services.events.dailySummary(getAuth(res).householdId, days))
  })

  return router
}
