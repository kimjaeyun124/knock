import { Router } from 'express'
import { PushSubscriptionInputSchema, type PushSubscribeResponse } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

/** 브라우저 푸시를 받을 기기 등록. 본인의 기기만 보고 지울 수 있다. */
export function createPushRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/config', (_req, res) => {
    res.json(services.push.config())
  })

  router.get('/subscriptions', async (_req, res) => {
    res.json({ subscriptions: await services.push.list(getAuth(res).guardianId) })
  })

  router.post('/subscribe', async (req, res) => {
    const input = PushSubscriptionInputSchema.parse(req.body)
    const body: PushSubscribeResponse = {
      subscription: await services.push.subscribe(getAuth(res).guardianId, input),
    }
    res.status(201).json(body)
  })

  router.delete('/subscriptions/:id', async (req, res) => {
    await services.push.remove(getAuth(res).guardianId, req.params.id)
    res.json({ ok: true })
  })

  return router
}
