import { Router } from 'express'
import type { HealthService } from '@/services/health.service'

export function createHealthRouter(health: HealthService): Router {
  const router = Router()
  router.get('/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(await health.check())
  })
  return router
}
