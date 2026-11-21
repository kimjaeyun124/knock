import { z } from './zod'

export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/**
 * 모든 오류 응답의 본문 형식. 서버는 항상 이 형태로 오류를 내려 보낸다.
 * code는 서버 버전이 달라져도 웹이 오류를 해석할 수 있도록 문자열로 받는다.
 */
export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    /** 입력 검증 오류일 때 어느 항목이 왜 잘못되었는지. (서버 내부 정보는 담지 않는다) */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
})

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>
