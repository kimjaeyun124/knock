import express, { type Express } from 'express'
import helmet from 'helmet'
import type { Env } from '@/config/env'
import type { Services } from '@/container'
import { createApiRateLimit } from '@/middleware/api-rate-limit'
import { createErrorHandler } from '@/middleware/error-handler'
import { notFound } from '@/middleware/not-found'
import { requestId } from '@/middleware/request-id'
import { createRequestLogger } from '@/middleware/request-logger'
import { createApiRouter } from '@/modules'
import type { Logger } from '@/utils/logger'
import { RateLimiter } from '@/utils/rate-limiter'

export interface AppDependencies {
  logger: Logger
  env: Pick<Env, 'CLIENT_ORIGIN' | 'COOKIE_SECURE' | 'TRUST_PROXY' | 'API_RATE_LIMIT_PER_MINUTE'>
  /** 요청 제한에 쓰는 시계. 테스트에서 바꾼다. */
  now?: () => Date
  services: Services
}

/** HTTP 앱 조립. 서버 시작(main.ts)과 분리해 두어 테스트에서 고정 포트 없이 만들 수 있다. */
export function createApp({ logger, env, services, now }: AppDependencies): Express {
  const app = express()

  app.disable('x-powered-by')
  // 프록시 뒤에서는 X-Forwarded-For 의 접속자 IP 를 쓴다. (로그인 시도 제한·오류 로그가 접속자별로 동작)
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY)
  app.use(requestId)
  app.use(helmet())
  app.use(createRequestLogger(logger))
  app.use(express.json({ limit: '100kb' }))

  if (env.API_RATE_LIMIT_PER_MINUTE > 0) {
    app.use(
      '/api',
      createApiRateLimit(
        new RateLimiter(now ?? (() => new Date()), env.API_RATE_LIMIT_PER_MINUTE, 60_000),
      ),
    )
  }
  app.use('/api', createApiRouter(services, env))

  // 순서 중요: 라우트 → 404 → 오류 처리
  app.use(notFound)
  app.use(createErrorHandler(logger))

  return app
}
