import { Router } from 'express'
import type { Env } from '@/config/env'
import type { Services } from '@/container'
import { createSameOriginGuard } from '@/middleware/same-origin'
import { createAuthRouter } from './auth/auth.routes'
import { createAlertsRouter } from './alerts/alerts.routes'
import { createEventsRouter } from './events/events.routes'
import { createHealthRouter } from './health/health.routes'
import { createDataRouter } from './data/data.routes'
import { createHouseholdRouter } from './household/household.routes'
import { createIngestRouter } from './ingest/ingest.routes'
import { createSensorsRouter } from './sensors/sensors.routes'
import { createNotificationsRouter } from './notifications/notifications.routes'
import { createPushRouter } from './push/push.routes'
import { createSettingsRouter } from './settings/settings.routes'
import { createSimulatorRouter } from './simulator/simulator.routes'
import { createSystemRouter } from './system/system.routes'
import { createTimelineRouter } from './timeline/timeline.routes'
import { createV1Router } from './v1'

/**
 * /api 아래에 붙는 모든 모듈 라우터. 기능 모듈은 여기에 추가한다.
 *
 * 쿠키로 인증하는 사용자용 API(/auth, /settings, ...)에는 출처 검사를 붙인다.
 * 장치용 수집 API(Phase 2, Bearer 토큰)는 쿠키를 쓰지 않으므로 이 검사 대상이 아니다.
 */
export function createApiRouter(
  services: Services,
  env: Pick<Env, 'CLIENT_ORIGIN' | 'COOKIE_SECURE'>,
): Router {
  const router = Router()
  const sameOrigin = createSameOriginGuard([env.CLIENT_ORIGIN])

  router.use(createHealthRouter(services.health))
  // 버전이 붙은 REST API. (/api/v1/...) 웹 화면이 쓰는 위의 경로와 같은 서비스를 쓴다.
  router.use('/v1', createV1Router(services, sameOrigin))
  router.use('/auth', sameOrigin, createAuthRouter(services, { cookieSecure: env.COOKIE_SECURE }))
  router.use('/household', sameOrigin, createHouseholdRouter(services))
  router.use('/settings', sameOrigin, createSettingsRouter(services))
  router.use('/sensors', sameOrigin, createSensorsRouter(services))
  router.use('/events', sameOrigin, createEventsRouter(services))
  router.use('/timeline', sameOrigin, createTimelineRouter(services))
  router.use('/alerts', sameOrigin, createAlertsRouter(services))
  router.use('/notifications', sameOrigin, createNotificationsRouter(services))
  router.use('/push', sameOrigin, createPushRouter(services))
  router.use('/data', sameOrigin, createDataRouter(services))
  router.use('/system', sameOrigin, createSystemRouter(services))
  router.use('/ingest', createIngestRouter(services))
  // 시뮬레이터가 꺼져 있으면(SIMULATOR_ENABLED=false) 경로 자체가 없다. 404 와 같은 응답이 나간다.
  if (services.simulator) {
    router.use('/dev/simulator', sameOrigin, createSimulatorRouter(services, services.simulator))
  }
  return router
}
