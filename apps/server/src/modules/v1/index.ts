import { Router } from 'express'
import type { RequestHandler } from 'express'
import type { Services } from '@/container'
import { createRequireAuth } from '@/middleware/require-auth'
import { createCareRecipientsController } from './care-recipients.controller'
import { createDashboardController } from './dashboard.controller'
import { createEventsController } from './events.controller'
import { createHealthController } from './health.controller'
import { createNotificationsController } from './notifications.controller'
import { createSensorsController } from './sensors.controller'
import { createSettingsController } from './settings.controller'

/**
 * /api/v1 — 버전이 붙은 REST API. docs/API.md.
 *
 * 구조: Controller(이 폴더: 요청 검증·응답 형식) → Service(services/: 규칙·권한) → Repository/Prisma(DB)
 * 인증은 로그인 세션 쿠키 하나뿐이고, **데이터 범위(가구)는 항상 세션에서 정해진다.**
 * 요청 본문·쿼리·경로로 사용자 ID 나 가구 ID 를 받는 곳은 없다.
 */
export function createV1Router(services: Services, sameOrigin: RequestHandler): Router {
  const router = Router()
  // 인증 정보가 담긴 응답이 중간에 저장되지 않게 한다.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.use(createHealthController(services.health)) // 로그인 없이 확인할 수 있다.

  const auth = createRequireAuth(services.sessions)
  router.use('/dashboard', sameOrigin, auth, createDashboardController(services))
  router.use('/sensors', sameOrigin, auth, createSensorsController(services))
  router.use('/events', sameOrigin, auth, createEventsController(services))
  router.use('/notifications', sameOrigin, auth, createNotificationsController(services))
  router.use('/settings', sameOrigin, auth, createSettingsController(services))
  router.use('/care-recipients', sameOrigin, auth, createCareRecipientsController(services))
  return router
}
