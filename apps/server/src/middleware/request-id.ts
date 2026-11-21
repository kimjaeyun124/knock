import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

const SAFE_ID = /^[\w-]{1,64}$/

/** 요청마다 추적용 ID를 붙인다. 오류 응답과 로그에 같은 ID가 남아 문제를 추적할 수 있다. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id')
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID()
  res.locals.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}

export function getRequestId(res: { locals: Record<string, unknown> }): string | undefined {
  const value = res.locals.requestId
  return typeof value === 'string' ? value : undefined
}
