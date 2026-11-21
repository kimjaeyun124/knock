import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AUTH_QUERY_KEY, SESSION_EXPIRED_KEY } from '@/hooks/useAuth'
import { ApiError } from '@/services/apiClient'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'
import { createQueryClient, shouldRetry } from './queryClient'

describe('shouldRetry', () => {
  it('네트워크 끊김·5xx 만 최대 2번 다시 시도하고, 시간 초과·4xx·형식 오류는 바로 오류로 보인다', () => {
    const net = new ApiError({ kind: 'network', message: 'x' })
    const server = new ApiError({ kind: 'http', status: 500, message: 'x' })
    expect(shouldRetry(0, net)).toBe(true)
    expect(shouldRetry(1, server)).toBe(true)
    expect(shouldRetry(2, net)).toBe(false)
    expect(shouldRetry(0, new ApiError({ kind: 'timeout', message: 'x' }))).toBe(false)
    expect(shouldRetry(0, new ApiError({ kind: 'offline', message: 'x' }))).toBe(false)
    expect(shouldRetry(0, new ApiError({ kind: 'http', status: 404, message: 'x' }))).toBe(false)
    expect(shouldRetry(0, new ApiError({ kind: 'invalid-response', message: 'x' }))).toBe(false)
    expect(shouldRetry(0, new Error('x'))).toBe(false)
  })
})

describe('세션 만료(401) 전역 처리', () => {
  const unauthorized = (path: string) =>
    new ApiError({ kind: 'http', status: 401, message: '로그인이 필요합니다.', path })

  it('로그인한 상태에서 데이터 요청이 401 이면 로그아웃 상태로 바꾸고 다른 캐시는 지운다', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(AUTH_QUERY_KEY, { guardian: { id: 'g1' } })
    client.setQueryData(['sensors', 'list'], { sensors: [] })
    await client
      .fetchQuery({
        queryKey: ['alerts', 'list'],
        queryFn: () => Promise.reject(unauthorized('/api/alerts')),
      })
      .catch(() => undefined)
    expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBe(true)
    expect(client.getQueryData(['sensors', 'list'])).toBeUndefined()
  })

  it('쓰기(mutation)가 401 이어도 같다', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(AUTH_QUERY_KEY, { guardian: { id: 'g1' } })
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(unauthorized('/api/sensors')) })
      .execute(undefined)
      .catch(() => undefined)
    expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull()
  })

  it('로그인 시도의 401(비밀번호 틀림)이나 이미 로그아웃된 상태에서는 아무것도 바꾸지 않는다', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(AUTH_QUERY_KEY, { guardian: { id: 'g1' } })
    await client
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(unauthorized('/api/auth/login')),
      })
      .catch(() => undefined)
    expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual({ guardian: { id: 'g1' } })
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()

    client.setQueryData(AUTH_QUERY_KEY, null)
    await client
      .fetchQuery({ queryKey: ['y'], queryFn: () => Promise.reject(unauthorized('/api/sensors')) })
      .catch(() => undefined)
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()
  })

  it('화면 사용 중 세션이 만료되면 로그인 화면으로 가서 "로그인이 만료되었습니다"를 알린다', async () => {
    let expired = false
    stubApi({
      ...loggedInHandlers(),
      'GET /api/auth/me': () =>
        expired
          ? errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
          : jsonResponse({
              guardian: { id: 'g1', email: 'demo@example.com', displayName: '데모 보호자' },
              household: { id: 'h1', name: '데모 가구', recipientAlias: '어르신(데모)' },
            }),
      'GET /api/sensors': () => {
        expired = true
        return errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
      },
    })
    const { router } = renderApp('/sensors')
    expect(
      await screen.findByText('로그인이 만료되었습니다', { selector: 'p' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })
})
