import { pino, type DestinationStream, type Logger } from 'pino'
import type { Env } from '@/config/env'

export type { Logger }

/**
 * 로그에 남아서는 안 되는 값. 오류 객체나 요청 정보를 통째로 로그에 넘기더라도 이 항목들은 가려진다.
 * (비밀번호, 장치 토큰, 세션 쿠키, 푸시 구독의 암호화 키 등)
 */
export const REDACT_PATHS = [
  'password',
  'token',
  'deviceToken',
  'authorization',
  'cookie',
  'auth',
  'p256dh',
  'privateKey',
  '*.password',
  '*.token',
  '*.deviceToken',
  '*.authorization',
  '*.cookie',
  '*.auth',
  '*.p256dh',
  '*.privateKey',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'err.config.headers.Authorization',
]

export function createLogger(env: Pick<Env, 'LOG_LEVEL'>, destination?: DestinationStream): Logger {
  return pino(
    { level: env.LOG_LEVEL, base: undefined, redact: { paths: REDACT_PATHS, censor: '[가려짐]' } },
    destination,
  )
}
