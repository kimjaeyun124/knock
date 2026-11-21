import type { ApiErrorCode } from '@tetris/shared'

/**
 * 사용자에게 그대로 보여 줘도 되는 오류. message는 한국어 문장으로 작성한다.
 * 내부 사정(스택, DB 오류 등)은 message에 넣지 말고 cause로 남긴다.
 */
export class AppError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** 응답에 함께 실을 헤더 (예: Retry-After, WWW-Authenticate) */
  readonly headers: Readonly<Record<string, string>>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options?: ErrorOptions & { headers?: Record<string, string> },
  ) {
    super(message, options)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.headers = options?.headers ?? {}
  }

  static badRequest(message = '요청을 처리할 수 없습니다. 입력 내용을 확인해 주세요.') {
    return new AppError(400, 'BAD_REQUEST', message)
  }

  static unauthorized(message = '로그인이 필요합니다.') {
    return new AppError(401, 'UNAUTHORIZED', message)
  }

  static forbidden(message = '이 작업을 할 권한이 없습니다.') {
    return new AppError(403, 'FORBIDDEN', message)
  }

  static notFound(message = '요청한 항목을 찾을 수 없습니다.') {
    return new AppError(404, 'NOT_FOUND', message)
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message)
  }

  static rateLimited(
    message = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    retryAfterSeconds?: number,
  ) {
    return new AppError(429, 'RATE_LIMITED', message, {
      ...(retryAfterSeconds ? { headers: { 'Retry-After': String(retryAfterSeconds) } } : {}),
    })
  }

  static serviceUnavailable(message: string, options?: ErrorOptions) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message, options)
  }
}
