import { Router } from 'express'
import { CareRecipientCreateSchema, CareRecipientUpdateSchema } from '@tetris/shared'
import type { Services } from '@/container'
import { getAuth } from '@/middleware/require-auth'
import { IdParamSchema, sendData } from './http'

/** /api/v1/care-recipients — 보호 대상(별칭만). 가구마다 한 명. */
export function createCareRecipientsController(services: Services): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    const list = await services.careRecipients.list(getAuth(res).householdId)
    sendData(res, list, { meta: { total: list.length } })
  })

  router.post('/', async (req, res) => {
    const input = CareRecipientCreateSchema.parse(req.body)
    sendData(res, await services.careRecipients.create(getAuth(res).householdId, input), {
      status: 201,
    })
  })

  router.patch('/:id', async (req, res) => {
    const { id } = IdParamSchema.parse(req.params)
    const input = CareRecipientUpdateSchema.parse(req.body)
    sendData(res, await services.careRecipients.update(getAuth(res).householdId, id, input))
  })

  return router
}
