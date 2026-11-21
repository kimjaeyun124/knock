import { Router } from 'express'
import { TimelineFilterSchema, TimelineQuerySchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

/** 움직임 기록(타임라인): 목록·요약·상세. 모두 로그인한 보호자의 가구 기록만 다룬다. */
export function createTimelineRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', async (req, res) => {
    const query = TimelineQuerySchema.parse(req.query)
    res.json(await services.timeline.list(getAuth(res).householdId, query))
  })

  // 같은 조건 전체에 대한 요약. ':id' 보다 먼저 둔다.
  router.get('/summary', async (req, res) => {
    const filter = TimelineFilterSchema.parse(req.query)
    res.json(await services.timeline.summary(getAuth(res).householdId, filter))
  })

  router.get('/:id', async (req, res) => {
    res.json(await services.timeline.get(getAuth(res).householdId, req.params.id))
  })

  return router
}
