import type { RequestHandler } from 'express'
import { AppError } from '@/utils/errors'
import { isAllowedOrigin } from '@/utils/origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * 쿠키로 인증하는 API 의 CSRF 방어.
 * 세션 쿠키는 SameSite=Lax 이고, 여기에 더해 데이터를 바꾸는 요청(POST 등)은
 * 허용된 웹 출처에서 온 것만 받는다. 다른 사이트에서 온 요청은 거부한다.
 */
export function createSameOriginGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }
    const origin = req.header('origin')
    const crossSite = req.header('sec-fetch-site') === 'cross-site'
    if (crossSite || (origin && !isAllowedOrigin(origin, allowedOrigins, req.header('host')))) {
      next(AppError.forbidden('허용되지 않은 출처에서 온 요청입니다.'))
      return
    }
    next()
  }
}
