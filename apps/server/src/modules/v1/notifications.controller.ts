import { Router } from 'express'
import { AlertsQuerySchema } from '@tetris/shared'
import type { Services } from '@/container'
import { getAuth } from '@/middleware/require-auth'
import { IdParamSchema, pageMeta, sendData } from './http'

/**
 * /api/v1/notifications — 알림 센터의 알림. (읽음 여부는 보호자별이다)
 * 읽음은 "봤다"는 표시일 뿐 확인·종료(처리 상태)와 별개다. (docs/NOTIFICATIONS.md)
 */
export function createNotificationsController(services: Services): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const filter = AlertsQuerySchema.parse(req.query)
    const { householdId, guardianId } = getAuth(res)
    const { alerts, nextCursor } = await services.alerts.list(householdId, guardianId, filter)
    sendData(res, alerts, { meta: pageMeta(filter.limit, nextCursor) })
  })

  // ':id' 보다 먼저 둔다.
  router.post('/read-all', async (_req, res) => {
    const { householdId, guardianId } = getAuth(res)
    sendData(res, await services.alerts.markAllRead(householdId, guardianId))
  })

  router.patch('/:id/read', async (req, res) => {
    const { id } = IdParamSchema.parse(req.params)
    const { householdId, guardianId } = getAuth(res)
    sendData(res, await services.alerts.markRead(householdId, guardianId, id))
  })

  return router
}
