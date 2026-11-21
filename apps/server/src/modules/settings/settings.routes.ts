import { Router } from 'express'
import { AlertPreferencesInputSchema, DetectionSettingsInputSchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

export function createSettingsRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/detection', async (_req, res) => {
    res.json(await services.settings.get(getAuth(res).householdId))
  })

  router.put('/detection', async (req, res) => {
    const input = DetectionSettingsInputSchema.parse(req.body)
    const { householdId } = getAuth(res)
    const settings = await services.settings.update(householdId, input)
    // 다른 기기에서 열려 있는 화면도 바뀐 설정을 바로 보게 한다.
    services.realtime.emitToHousehold(householdId, 'settings.updated', { settings })
    await services.monitoring.publish(householdId)
    res.json(settings)
  })

  router.get('/alerts', async (_req, res) => {
    res.json(await services.settings.getAlertPreferences(getAuth(res).householdId))
  })

  router.put('/alerts', async (req, res) => {
    const input = AlertPreferencesInputSchema.parse(req.body)
    res.json(await services.settings.updateAlertPreferences(getAuth(res).householdId, input))
  })

  return router
}
