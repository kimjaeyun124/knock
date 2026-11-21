import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import type { ApiErrorBody, ApiErrorCode } from '@tetris/shared'
import { AppError } from '@/utils/errors'
import type { Logger } from '@/utils/logger'
import { getRequestId } from './request-id'

interface NormalizedError {
  status: number
  code: ApiErrorCode
  message: string
  headers?: Readonly<Record<string, string>>
  details?: { path: string; message: string }[]
}

const INTERNAL_MESSAGE = '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'

function getClientErrorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('status' in err)) return null
  const { status } = err
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null
}

/** 어떤 오류든 사용자에게 보여 줄 수 있는 형태로 바꾼다. 내부 오류의 세부 내용은 노출하지 않는다. */
function normalize(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, headers: err.headers }
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: '요청 내용이 올바르지 않습니다.',
      details: err.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    }
  }
  // express.json() 등이 던지는 4xx (잘못된 JSON, 너무 큰 본문 등)
  const clientStatus = getClientErrorStatus(err)
  if (clientStatus !== null) {
    const message =
      clientStatus === 413
        ? '요청 내용이 너무 큽니다.'
        : '요청을 처리할 수 없습니다. 입력 내용을 확인해 주세요.'
    return { status: clientStatus, code: 'BAD_REQUEST', message }
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: INTERNAL_MESSAGE }
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    const requestId = getRequestId(res)
    const normalized = normalize(err)

    const context = {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      ip: req.ip,
    }
    if (normalized.status >= 500) {
      logger.error({ ...context, err }, '요청 처리 중 서버 오류')
    } else {
      // 4xx는 호출자의 잘못이므로 스택 없이 한 줄로 남긴다.
      logger.warn(
        { ...context, status: normalized.status, code: normalized.code },
        normalized.message,
      )
    }

    const body: ApiErrorBody = {
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(requestId ? { requestId } : {}),
        ...(normalized.details ? { details: normalized.details } : {}),
      },
    }
    for (const [name, value] of Object.entries(normalized.headers ?? {})) res.setHeader(name, value)
    res.status(normalized.status).json(body)
  }
}
