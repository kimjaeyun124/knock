import type { RequestHandler, Response } from 'express'
import type { AuthContext, SessionService } from '@/services/session.service'
import { AppError } from '@/utils/errors'
import { readSessionToken } from '@/utils/session-cookie'

/** 로그인한 보호자만 통과시킨다. 통과하면 res.locals 에 인증 정보를 넣는다. */
export function createRequireAuth(sessions: SessionService): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req)
    const auth = token ? await sessions.validate(token) : null
    if (!auth) {
      next(AppError.unauthorized())
      return
    }
    res.locals.auth = auth
    next()
  }
}

/** requireAuth 뒤에 있는 핸들러에서 현재 보호자·가구 정보를 꺼낸다. */
export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined
  if (!auth) throw AppError.unauthorized()
  return auth
}
