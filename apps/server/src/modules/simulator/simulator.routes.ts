import express, { Router } from 'express'
import {
  SimulatorBatteryRequestSchema,
  SimulatorEnsureRequestSchema,
  ZoneKindSchema,
  SimulatorFaultRequestSchema,
  SimulatorMotionRequestSchema,
  SimulatorRunRequestSchema,
  SimulatorSilenceRequestSchema,
  ALERT_CLIP_LIMITS,
  type AlertClipUploadResponse,
} from '@tetris/shared'
import { parseClipMimeType } from '@/services/alert-clip.service'
import { AppError } from '@/utils/errors'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'
import type { SimulatorService } from '@/services/simulator.service'

/** 개발·시연용 시뮬레이터 API. SIMULATOR_ENABLED 일 때만 등록된다. 모든 응답은 현재 시뮬레이터 상태. */
export function createSimulatorRouter(services: Services, simulator: SimulatorService): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/state', async (_req, res) => {
    res.json(await simulator.getState(getAuth(res).householdId))
  })

  // 센서 만들기(연결). 본문에 zone 을 주면 그 구역만, 없으면 세 구역 모두.
  router.post('/sensors', async (req, res) => {
    const { zone } = SimulatorEnsureRequestSchema.parse(req.body ?? {})
    const { householdId } = getAuth(res)
    await simulator.ensureSensors(householdId, zone)
    res.json(await simulator.getState(householdId))
  })

  // 센서 연결 해제(삭제). 시뮬레이션 센서만 지운다.
  router.delete('/sensors/:zone', async (req, res) => {
    const zone = ZoneKindSchema.parse(req.params.zone)
    const { householdId } = getAuth(res)
    await simulator.removeSensor(householdId, zone)
    res.json(await simulator.getState(householdId))
  })

  router.post('/motion', async (req, res) => {
    const { zone, mode, count, when } = SimulatorMotionRequestSchema.parse(req.body)
    const { householdId } = getAuth(res)
    await simulator.motion(householdId, zone, { mode, ...(count ? { count } : {}), when })
    res.json(await simulator.getState(householdId))
  })

  /**
   * 시연용 웹캠이 알림이 만들어진 순간의 짧은 영상을 그 알림에 붙인다. 본문은 영상 그대로(video/webm·mp4).
   * 시뮬레이션 알림에만 붙고, 크기·개수를 제한한다. (영상 내용은 로그에 남기지 않는다)
   */
  router.post(
    '/alerts/:alertId/clips',
    express.raw({ type: () => true, limit: ALERT_CLIP_LIMITS.maxBytes }),
    async (req, res) => {
      const mimeType = parseClipMimeType(req.header('content-type'))
      if (!mimeType) {
        throw new AppError(415, 'BAD_REQUEST', '영상 형식(webm·mp4)만 받을 수 있습니다.')
      }
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const raw = Number(req.query.durationMs)
      const durationMs = Number.isInteger(raw) && raw >= 0 && raw <= 60_000 ? raw : null
      const { householdId } = getAuth(res)
      const body: AlertClipUploadResponse = {
        clip: await services.clips.save(householdId, req.params.alertId, {
          mimeType,
          data,
          durationMs,
        }),
      }
      res.status(201).json(body)
    },
  )

  router.post('/battery', async (req, res) => {
    const { zone, batteryPercent } = SimulatorBatteryRequestSchema.parse(req.body)
    const { householdId } = getAuth(res)
    await simulator.setBattery(householdId, zone, batteryPercent)
    res.json(await simulator.getState(householdId))
  })

  router.post('/silence', async (req, res) => {
    const { zone, silenced, fastForward } = SimulatorSilenceRequestSchema.parse(req.body)
    const { householdId } = getAuth(res)
    await simulator.setSilenced(householdId, zone, silenced, fastForward === true)
    res.json(await simulator.getState(householdId))
  })

  router.post('/faults', async (req, res) => {
    const { deliveryFailure } = SimulatorFaultRequestSchema.parse(req.body)
    simulator.setDeliveryFailure(deliveryFailure)
    res.json(await simulator.getState(getAuth(res).householdId))
  })

  router.post('/scenarios/stop', async (_req, res) => {
    const { householdId } = getAuth(res)
    simulator.stopScenario(householdId)
    await simulator.idle(householdId)
    res.json(await simulator.getState(householdId))
  })

  router.post('/scenarios/:id/run', async (req, res) => {
    const { speed } = SimulatorRunRequestSchema.parse(req.body ?? {})
    const { householdId } = getAuth(res)
    await simulator.runScenario(householdId, req.params.id, speed)
    res.json(await simulator.getState(householdId))
  })

  return router
}
