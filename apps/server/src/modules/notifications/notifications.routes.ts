import { Router } from 'express'
import { ChannelTestRequestSchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

export function createNotificationsRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  /** 알림 채널 테스트 발송. 지금 로그인한 보호자 본인에게만 보낸다. */
  router.post('/test', async (req, res) => {
    const { channel } = ChannelTestRequestSchema.parse(req.body)
    const { guardianId, householdId } = getAuth(res)
    res.json(await services.channels.test({ id: guardianId, householdId }, channel))
  })

  return router
}
