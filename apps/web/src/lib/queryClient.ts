import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query'
import { AUTH_QUERY_KEY, SESSION_EXPIRED_KEY, clearUserData } from '@/hooks/useAuth'
import { ApiError } from '@/services/apiClient'
import { isSessionExpired } from './apiErrors'

/**
 * 재시도는 "다시 해 보면 성공할 수 있는" 오류(네트워크 끊김, 5xx)에만, 최대 2번.
 * 4xx나 응답 형식 오류는 다시 시도해도 같으므로 바로 오류로 보여 준다.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (!(error instanceof ApiError)) return false
  // 응답 시간 초과는 사용자가 "다시 시도"로 직접 다시 해 보게 한다. (자동 재시도가 기다림을 몇 배로 늘리지 않게)
  // 인터넷이 끊겨 있으면(offline) 다시 시도해도 같으므로, 연결이 돌아왔을 때 다시 읽는다.
  return error.kind === 'network' || (error.status !== null && error.status >= 500)
}

/**
 * 로그인한 상태에서 어떤 요청이든 401 을 받으면(세션 만료) 화면을 로그아웃 상태로 바꾼다.
 * RequireAuth 가 로그인 화면으로 보내고, 로그인 화면은 "로그인이 만료되었습니다"를 알린다.
 * 이전 사용자의 데이터가 남아 보이지 않도록 로그인 정보 외의 캐시는 지운다.
 */
function expireSession(queryClient: QueryClient): void {
  if (!queryClient.getQueryData(AUTH_QUERY_KEY)) return // 이미 로그아웃 상태
  void queryClient.cancelQueries()
  clearUserData(queryClient)
  queryClient.setQueryData(SESSION_EXPIRED_KEY, true)
  queryClient.setQueryData(AUTH_QUERY_KEY, null)
}

export function createQueryClient(overrides: DefaultOptions['queries'] = {}): QueryClient {
  const onError = (error: unknown) => {
    if (isSessionExpired(error)) expireSession(queryClient)
  }
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
        ...overrides,
      },
    },
  })
  return queryClient
}
