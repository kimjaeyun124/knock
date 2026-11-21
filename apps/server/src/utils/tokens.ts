import { createHash, randomBytes } from 'node:crypto'
import { DEVICE_TOKEN_PREFIX } from '@tetris/shared'

/** 토큰은 DB에 원문으로 저장하지 않고 SHA-256 해시만 저장한다. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 장치 토큰: 접두사 + 무작위 256비트. 발급 때 한 번만 보여 준다. */
export function generateDeviceToken(): string {
  return `${DEVICE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

/** `Authorization: Bearer <토큰>` 헤더에서 토큰만 꺼낸다. 형식이 다르면 undefined */
export function parseBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1]
}
