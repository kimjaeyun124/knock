import { Router } from 'express'
import type { HealthService } from '@/services/health.service'
import { sendData } from './http'

/** GET /api/v1/health */
export function createHealthController(health: HealthService): Router {
  const router = Router()
  router.get('/health', async (_req, res) => {
    sendData(res, await health.check())
  })
  return router
}
