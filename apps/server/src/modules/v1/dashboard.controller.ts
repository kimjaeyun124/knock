import { Router } from 'express'
import type { Services } from '@/container'
import { getAuth } from '@/middleware/require-auth'
import { sendData } from './http'

/** GET /api/v1/dashboard/summary */
export function createDashboardController(services: Services): Router {
  const router = Router()
  router.get('/summary', async (_req, res) => {
    const { householdId, guardianId } = getAuth(res)
    sendData(res, await services.dashboard.summary(householdId, guardianId))
  })
  return router
}
