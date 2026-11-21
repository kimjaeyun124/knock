import type { RequestHandler } from 'express'
import { AppError } from '@/utils/errors'
import type { RateLimiter } from '@/utils/rate-limiter'

/** 요청 제한에서 빼는 경로. 상태 점검은 모니터링 도구가 자주 부르고, 장치 수집 API 는 센서별 제한이 따로 있다. */
const EXEMPT_PREFIXES = ['/health', '/ingest']

/**
 * 사용자용 API 전체의 접속자(IP)별 요청 제한. 로그인 시도 제한·장치별 제한과 별개로,
 * 한 곳에서 쏟아지는 요청이 서버(와 SQLite)를 점유하지 못하게 하는 최소한의 보호다.
 * 정상 사용(대시보드 새로고침·알림 처리)은 한도에 닿지 않을 만큼 넉넉하게 잡는다.
 */
export function createApiRateLimit(limiter: RateLimiter): RequestHandler {
  return (req, _res, next) => {
    if (
      EXEMPT_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))
    ) {
      next()
      return
    }
    const result = limiter.consume(req.ip ?? 'unknown')
    if (result.allowed) {
      next()
      return
    }
    next(AppError.rateLimited(undefined, result.retryAfterSeconds))
  }
}
