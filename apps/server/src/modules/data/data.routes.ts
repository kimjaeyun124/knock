import { Router } from 'express'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

/** 실제/시뮬레이션 데이터 양 조회와 시뮬레이션 데이터 삭제. 시뮬레이터가 꺼져 있어도 지울 수 있다. */
export function createDataRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/summary', async (_req, res) => {
    res.json(await services.data.summary(getAuth(res).householdId))
  })

  router.delete('/simulated', async (_req, res) => {
    res.json(await services.data.deleteSimulated(getAuth(res).householdId))
  })

  return router
}
