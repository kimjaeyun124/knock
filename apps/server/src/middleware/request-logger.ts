import type { RequestHandler } from 'express'
import type { Logger } from '@/utils/logger'
import { getRequestId } from './request-id'

/** 응답이 끝나면 한 줄 로그를 남긴다. 쿼리스트링은 민감값이 있을 수 있어 기록하지 않는다. */
export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint()
    // 라우터를 지나면 req.path가 마운트 경로를 뺀 값으로 바뀌므로 요청 시작 시점에 저장한다.
    const path = req.path
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      // 웹이 주기적으로 호출하는 헬스체크는 debug로 낮춰 로그 소음을 줄인다.
      const level = path === '/api/health' ? 'debug' : 'info'
      logger[level](
        {
          requestId: getRequestId(res),
          method: req.method,
          path,
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        },
        'request',
      )
    })
    next()
  }
}
