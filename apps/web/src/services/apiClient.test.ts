import { afterEach, describe, expect, it, vi } from 'vitest'
import { HealthResponseSchema } from '@tetris/shared'
import { HEALTH_BODY, jsonResponse, stubFetch } from '@/test/helpers'
import { ApiError, REQUEST_TIMEOUT_MS, apiRequest } from './apiClient'

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('오류가 발생해야 하는데 성공했습니다.')
}

describe('apiRequest', () => {
  it('2xx이고 스키마와 일치하면 데이터를 돌려준다', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(HEALTH_BODY)))
    const data = await apiRequest('/api/health', HealthResponseSchema)
    expect(data.service).toBe('tetris-server')
  })

  it('서버에 연결하지 못하면 network 오류로 알린다', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await failureOf(apiRequest('/api/health', HealthResponseSchema))
    expect(error.kind).toBe('network')
    expect(error.message).toContain('서버에 연결할 수 없습니다')
  })

  it('서버가 보낸 오류 본문의 한국어 메시지와 코드를 보존한다', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          { error: { code: 'FORBIDDEN', message: '권한이 없습니다.', requestId: 'r1' } },
          403,
        ),
      ),
    )
    const error = await failureOf(apiRequest('/api/health', HealthResponseSchema))
    expect(error).toMatchObject({ kind: 'http', status: 403, code: 'FORBIDDEN', requestId: 'r1' })
    expect(error.message).toBe('권한이 없습니다.')
  })

  it('프록시가 돌려준 502(서버 꺼짐)를 성공으로 취급하지 않는다', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 502 })))
    const error = await failureOf(apiRequest('/api/health', HealthResponseSchema))
    expect(error.kind).toBe('http')
    expect(error.message).toContain('서버에 연결할 수 없습니다')
  })

  it('200이어도 HTML(SPA 폴백 등)이면 성공으로 취급하지 않는다', async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    const error = await failureOf(apiRequest('/api/health', HealthResponseSchema))
    expect(error.kind).toBe('invalid-response')
  })

  it('200이어도 스키마와 다른 JSON이면 invalid-response 오류다', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ status: 'ok' })))
    const error = await failureOf(apiRequest('/api/health', HealthResponseSchema))
    expect(error.kind).toBe('invalid-response')
  })
})

describe('연결 오류 구분', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** 신호(abort)를 받으면 AbortError 로 끝나는, 응답이 오지 않는 fetch */
  function stubHangingFetch() {
    const fn = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          // 실제 fetch 처럼, 이미 취소된 신호면 바로 거절한다.
          if (init?.signal?.aborted) reject(new DOMException('Aborted', 'AbortError'))
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fn)
    return fn
  }

  it('정해진 시간 안에 응답이 없으면 timeout 오류로 알린다', async () => {
    vi.useFakeTimers()
    stubHangingFetch()
    const pending = failureOf(apiRequest('/api/health', HealthResponseSchema))
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    const error = await pending
    expect(error).toMatchObject({ kind: 'timeout', path: '/api/health' })
    expect(error.message).toContain('정해진 시간 안에 응답하지 않았습니다')
  })

  it('호출자가 취소한 요청은 오류 표시 대상이 아니므로 AbortError 를 그대로 전달한다', async () => {
    stubHangingFetch()
    const controller = new AbortController()
    const pending = apiRequest('/api/health', HealthResponseSchema, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('이미 취소된 신호로 요청하면 기다리지 않고 바로 취소된다', async () => {
    const fn = stubHangingFetch()
    const controller = new AbortController()
    controller.abort()
    await expect(
      apiRequest('/api/health', HealthResponseSchema, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('응답이 정상이면 시간 초과 타이머가 남아 있지 않다', async () => {
    vi.useFakeTimers()
    stubFetch(() => Promise.resolve(jsonResponse(HEALTH_BODY)))
    await apiRequest('/api/health', HealthResponseSchema)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('기기가 오프라인이면 서버 문제가 아니라 인터넷 연결 문제로 알린다', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const error = await failureOf(apiRequest('/api/health', HealthResponseSchema))
    expect(error.kind).toBe('offline')
    expect(error.message).toContain('인터넷 연결이 끊겨 있습니다')
  })

  it('요청한 경로를 오류에 담는다 (로그인 실패와 세션 만료를 구별하는 데 쓴다)', async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' } }, 401),
      ),
    )
    const error = await failureOf(apiRequest('/api/sensors', HealthResponseSchema))
    expect(error).toMatchObject({ kind: 'http', status: 401, path: '/api/sensors' })
  })
})
