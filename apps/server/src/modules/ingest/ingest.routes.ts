import { Router } from 'express'
import { ZodError } from 'zod'
import { HeartbeatRequestSchema, IngestEventsRequestSchema } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireDevice, getDevice } from '@/middleware/require-device'

/**
 * 장치용 수집 API (docs/INGEST_CONTRACT.md).
 * 브라우저 쿠키가 아니라 장치 토큰으로 인증하므로 출처(Origin) 검사를 적용하지 않는다.
 */
export function createIngestRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireDevice(services.deviceAuth))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  /** 형식이 틀린 요청이면 어느 센서가 보낸 것인지 기록해 두고(센서의 "데이터 수신 오류") 400 으로 응답한다. */
  const parseOrRecord = async <T>(
    res: Parameters<typeof getDevice>[0],
    parse: () => T,
  ): Promise<T> => {
    try {
      return parse()
    } catch (error) {
      if (error instanceof ZodError) {
        const sensor = getDevice(res)
        await services.ingest.recordReceiveError(sensor.id, new Date(), 1, 'INVALID_PAYLOAD')
      }
      throw error
    }
  }

  router.post('/v1/events', async (req, res) => {
    const input = await parseOrRecord(res, () => IngestEventsRequestSchema.parse(req.body))
    res.json(await services.ingest.ingestEvents(getDevice(res), input))
  })

  // 본문 없이 보내도 된다. (배터리 정보가 없는 장치)
  router.post('/v1/heartbeat', async (req, res) => {
    const input = await parseOrRecord(res, () => HeartbeatRequestSchema.parse(req.body ?? {}))
    res.json(await services.ingest.recordHeartbeat(getDevice(res), input))
  })

  return router
}
