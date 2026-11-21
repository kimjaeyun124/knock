import type { RequestHandler } from 'express'
import { AppError } from '@/utils/errors'

/** 어떤 라우트에도 맞지 않은 요청을 JSON 404로 응답한다. (HTML 오류 페이지를 내려 주지 않는다) */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('요청한 경로를 찾을 수 없습니다.'))
}
