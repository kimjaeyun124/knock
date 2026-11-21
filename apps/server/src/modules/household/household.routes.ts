import { Router } from 'express'
import { HouseholdUpdateSchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

export function createHouseholdRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', async (_req, res) => {
    res.json({ household: await services.household.get(getAuth(res).householdId) })
  })

  router.put('/', async (req, res) => {
    const input = HouseholdUpdateSchema.parse(req.body)
    res.json({ household: await services.household.update(getAuth(res).householdId, input) })
  })

  return router
}
