import { Router } from 'express'
import type { BackupStatus, FeaturesResponse, SensorAdaptersResponse } from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'

/** 화면이 어떤 기능을 보여 줄지 정하는 데 쓰는 서버 설정 */
export function createSystemRouter(services: Services): Router {
  const router = Router()
  router.use(createRequireAuth(services.sessions))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/features', (_req, res) => {
    const body: FeaturesResponse = { simulatorEnabled: services.simulator !== null }
    res.json(body)
  })

  /** 알림 채널별 연동 상태: 실제 연동 / 가짜 응답 / 연동되지 않음 */
  router.get('/integrations', async (_req, res) => {
    res.json(await services.channels.integrations(getAuth(res).householdId))
  })

  /** 채널별 구현 여부와 스마트워치 플랫폼별로 아직 필요한 작업 */
  router.get('/channel-support', (_req, res) => {
    res.json(services.channels.support())
  })

  /** 센서 어댑터 상태. 실제 하드웨어가 연결되어 있지 않으면 realHardwareConnected 는 false 다. */
  router.get('/sensor-adapters', (_req, res) => {
    const body: SensorAdaptersResponse = { adapters: services.sensorAdapters.statuses() }
    res.json(body)
  })

  /** 자동 데이터베이스 백업 상태. 설정하지 않았으면 enabled: false (경로·오류 상세는 내보내지 않는다) */
  router.get('/backup', (_req, res) => {
    const disabled: BackupStatus = {
      enabled: false,
      intervalHours: null,
      keep: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastRunFailed: false,
      backupCount: 0,
    }
    res.json(services.backup?.status() ?? disabled)
  })

  return router
}
