import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema, HealthResponseSchema } from '@tetris/shared'
import { HealthService } from '@/services/health.service'
import { createTestContext, type TestContext } from '@/test-utils/context'

describe('GET /api/health', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('서버와 DB 상태를 공유 스키마에 맞게 응답한다', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toBeTruthy()
    const body = HealthResponseSchema.parse(await res.json())
    expect(body.checks.database).toBe('up')
  })

  it('정의되지 않은 API 경로는 JSON 404를 돌려준다', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/does-not-exist`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('NOT_FOUND')
  })

  it('깨진 JSON 본문은 400 BAD_REQUEST로 응답하고 내부 정보를 노출하지 않는다', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    })
    expect(res.status).toBe(400)
    const body = ApiErrorBodySchema.parse(await res.json())
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).not.toContain('JSON')
  })
})

describe('GET /api/health — DB 장애', () => {
  let ctx: TestContext
  beforeAll(async () => {
    const failing = new HealthService(
      () => Promise.reject(new Error('SQLITE_CANTOPEN: /secret/path/tetris.db')),
      Date.now(),
      () => new Date(),
    )
    ctx = await createTestContext({ services: { health: failing } })
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('DB를 쓸 수 없으면 정상 응답 대신 503을 돌려주고 내부 경로를 노출하지 않는다', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/health`)
    expect(res.status).toBe(503)
    const text = await res.text()
    expect(text).not.toContain('/secret/path')
    const body = ApiErrorBodySchema.parse(JSON.parse(text))
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE')
    expect(body.error.message).toBe('데이터베이스에 연결할 수 없습니다.')
  })
})
