import type { CookieOptions, Request, Response } from 'express'
import { SESSION_COOKIE_NAME } from '@/config/auth'
import { parseCookies } from './cookies'

function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/' }
}

export function setSessionCookie(
  res: Response,
  token: string,
  expires: Date,
  secure: boolean,
): void {
  res.cookie(SESSION_COOKIE_NAME, token, { ...baseOptions(secure), expires })
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseOptions(secure))
}

/**
 * 세션 토큰을 읽는다. 웹은 HttpOnly 쿠키, 휴대폰 앱은 `Authorization: Bearer <token>` 으로 보낸다.
 * 쿠키가 있으면 쿠키를 먼저 쓴다. (Bearer 는 브라우저가 자동으로 붙이지 않으므로 CSRF 대상이 아니다)
 */
export function readSessionToken(req: Pick<Request, 'headers'>): string | undefined {
  return parseCookies(req.headers.cookie).get(SESSION_COOKIE_NAME) ?? readBearerToken(req)
}

export function readBearerToken(req: Pick<Request, 'headers'>): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== 'string') return undefined
  const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header.trim())
  return match?.[1]
}
