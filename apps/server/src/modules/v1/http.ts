import type { Response } from 'express'
import { z } from 'zod'

/**
 * API v1 응답 형식.
 *   성공  { "data": ... , "meta": { ... } }          (meta 는 페이지 정보 등이 있을 때만)
 *   실패  { "error": { "code", "message", "requestId", "details"? } }   (모든 API 가 같은 오류 형식)
 */
export type PageMeta = {
  limit: number
  /** 다음 쪽을 요청할 때 cursor 로 보낸다. 마지막 쪽이면 null */
  nextCursor: string | null
  hasMore: boolean
}

export function sendData<T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: Record<string, unknown> } = {},
): void {
  res.status(options.status ?? 200).json({ data, ...(options.meta ? { meta: options.meta } : {}) })
}

export function pageMeta(limit: number, nextCursor: string | null): PageMeta {
  return { limit, nextCursor, hasMore: nextCursor !== null }
}

/** 경로의 ID. 비었거나 이상한 글자가 들어 있으면 400 이다. (없는 ID 와 구별한다: 형식이 맞는데 없으면 404) */
export const IdParamSchema = z.object({
  id: z
    .string()
    .min(1, 'ID 를 입력해 주세요.')
    .max(64, 'ID 가 너무 깁니다.')
    .regex(/^[A-Za-z0-9_-]+$/, 'ID 형식이 올바르지 않습니다.'),
})

const IsoDate = z.iso.datetime({ offset: true })

/** 날짜 범위: from ≤ to 이어야 한다. */
export const DateRangeSchema = z
  .object({ from: IsoDate.optional(), to: IsoDate.optional() })
  .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), {
    path: ['to'],
    message: '종료 시각(to)은 시작 시각(from)보다 같거나 늦어야 합니다.',
  })

export const OrderSchema = z.enum(['asc', 'desc'])
