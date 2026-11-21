import { Router } from 'express'
import { SensorCreateSchema, SensorUpdateSchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

export function createSensorsRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    // 장치 토큰이 담긴 응답이 저장되지 않게 한다.
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/', async (_req, res) => {
    res.json({ sensors: await services.sensors.list(getAuth(res).householdId) })
  })

  router.post('/', async (req, res) => {
    const input = SensorCreateSchema.parse(req.body)
    res.status(201).json(await services.sensors.create(getAuth(res).householdId, input))
  })

  router.get('/:id', async (req, res) => {
    res.json({ sensor: await services.sensors.get(getAuth(res).householdId, req.params.id) })
  })

  router.patch('/:id', async (req, res) => {
    const patch = SensorUpdateSchema.parse(req.body)
    res.json({
      sensor: await services.sensors.update(getAuth(res).householdId, req.params.id, patch),
    })
  })

  router.post('/:id/rotate-token', async (req, res) => {
    res.json(await services.sensors.rotateToken(getAuth(res).householdId, req.params.id))
  })

  router.delete('/:id', async (req, res) => {
    res.json(await services.sensors.remove(getAuth(res).householdId, req.params.id))
  })

  return router
}
