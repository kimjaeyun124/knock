import express from 'express'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { ApiErrorBodySchema } from '@tetris/shared'
import { AppError } from '@/utils/errors'
import { withTestServer } from '@/test-utils/http'
import { createErrorHandler } from './error-handler'
import { requestId } from './request-id'

const logger = pino({ level: 'silent' })

function buildApp() {
  const app = express()
  app.use(requestId)
  app.get('/boom', () => {
    throw new Error('DB 비밀번호 hunter2 로 연결 실패')
  })
  app.get('/async-boom', async () => {
    await Promise.resolve()
    throw new Error('비동기 내부 오류')
  })
  app.get('/forbidden', () => {
    throw AppError.forbidden()
  })
  app.use(createErrorHandler(logger))
  return app
}

describe('오류 처리 미들웨어', () => {
  it('예상하지 못한 오류는 500으로 응답하고 원인 메시지를 노출하지 않는다', async () => {
    await withTestServer(buildApp(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/boom`)
      expect(res.status).toBe(500)
      const text = await res.text()
      expect(text).not.toContain('hunter2')
      const body = ApiErrorBodySchema.parse(JSON.parse(text))
      expect(body.error.code).toBe('INTERNAL_ERROR')
      expect(body.error.requestId).toBe(res.headers.get('x-request-id'))
    })
  })

  it('Express 5에서는 async 핸들러의 오류도 오류 처리기로 전달된다', async () => {
    await withTestServer(buildApp(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/async-boom`)
      expect(res.status).toBe(500)
      expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('INTERNAL_ERROR')
    })
  })

  it('AppError는 지정한 상태 코드와 한국어 메시지를 그대로 쓴다', async () => {
    await withTestServer(buildApp(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/forbidden`)
      expect(res.status).toBe(403)
      const body = ApiErrorBodySchema.parse(await res.json())
      expect(body.error.code).toBe('FORBIDDEN')
      expect(body.error.message).toBe('이 작업을 할 권한이 없습니다.')
    })
  })
})
