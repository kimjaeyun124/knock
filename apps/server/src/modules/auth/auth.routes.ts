import { Router } from 'express'
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  type LogoutResponse,
  type MobileLoginResponse,
  type SetupStatusResponse,
} from '@tetris/shared'
import type { Services } from '@/container'
import { createRequireAuth, getAuth } from '@/middleware/require-auth'
import { clearSessionCookie, readSessionToken, setSessionCookie } from '@/utils/session-cookie'

export function createAuthRouter(services: Services, options: { cookieSecure: boolean }): Router {
  const router = Router()
  const requireAuth = createRequireAuth(services.sessions)

  // 로그인 관련 응답은 브라우저나 중간 장치가 저장하지 않게 한다.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.post('/login', async (req, res) => {
    const body = LoginRequestSchema.parse(req.body)

    // 이미 로그인된 브라우저가 다시 로그인하면 이전 세션은 폐기한다.
    const previousToken = readSessionToken(req)
    if (previousToken) await services.sessions.revoke(previousToken)

    const result = await services.auth.login({
      email: body.email,
      password: body.password,
      clientKey: req.ip ?? 'unknown',
    })
    setSessionCookie(res, result.token, result.expiresAt, options.cookieSecure)
    res.json(result.session)
  })

  /**
   * 휴대폰 앱용 로그인. 쿠키를 설정하지 않고 세션 토큰을 본문으로 돌려준다.
   * 같은 비밀번호 확인·시도 제한(로그인 실패 5회/15분)을 그대로 쓴다.
   */
  router.post('/mobile/login', async (req, res) => {
    const body = LoginRequestSchema.parse(req.body)
    const result = await services.auth.login({
      email: body.email,
      password: body.password,
      clientKey: req.ip ?? 'unknown',
    })
    const response: MobileLoginResponse = {
      ...result.session,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json(response)
  })

  router.get('/setup-status', async (_req, res) => {
    const body: SetupStatusResponse = { needsSetup: await services.auth.needsSetup() }
    res.json(body)
  })

  // 첫 계정 만들기. 보호자가 한 명도 없을 때만 동작한다.
  router.post('/register', async (req, res) => {
    const body = RegisterRequestSchema.parse(req.body)
    const result = await services.auth.register(body)
    setSessionCookie(res, result.token, result.expiresAt, options.cookieSecure)
    res.status(201).json(result.session)
  })

  // 로그아웃은 이미 로그아웃된 상태에서도 성공으로 응답한다. (같은 결과를 보장)
  router.post('/logout', async (req, res) => {
    const token = readSessionToken(req)
    if (token) await services.sessions.revoke(token)
    clearSessionCookie(res, options.cookieSecure)
    const body: LogoutResponse = { ok: true }
    res.json(body)
  })

  // 비밀번호 변경. 현재 비밀번호를 다시 확인하고, 이 기기를 뺀 다른 기기의 로그인을 끊는다.
  router.post('/password', requireAuth, async (req, res) => {
    const body = ChangePasswordRequestSchema.parse(req.body)
    res.json(await services.auth.changePassword(getAuth(res), body, req.ip ?? 'unknown'))
  })

  router.get('/me', requireAuth, async (_req, res) => {
    res.json(await services.auth.me(getAuth(res)))
  })

  return router
}
