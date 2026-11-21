import { AppError } from '@/utils/errors'

/** 목록의 "다음 쪽" 위치. 정렬 기준 시각(ms)과 ID 로 정렬 순서를 정확히 이어 간다. */
export interface ListCursor {
  atMs: number
  id: string
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(`${cursor.atMs}:${cursor.id}`).toString('base64url')
}

export function decodeCursor(value: string): ListCursor {
  const text = Buffer.from(value, 'base64url').toString('utf8')
  const match = /^(\d{1,15}):([A-Za-z0-9_-]{1,64})$/.exec(text)
  if (!match) throw AppError.badRequest('페이지 위치 값이 올바르지 않습니다.')
  return { atMs: Number(match[1]), id: match[2] ?? '' }
}
