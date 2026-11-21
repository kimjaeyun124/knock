import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { AuthSessionResponse, LoginRequest } from '@tetris/shared'
import { useApi } from './useApi'

export const AUTH_QUERY_KEY = ['auth', 'session'] as const
/** 세션이 만료되어 로그인 화면으로 보내졌는가. 로그인 화면이 한 번 안내하고, 로그인하면 지운다. */
export const SESSION_EXPIRED_KEY = ['auth', 'expired'] as const

/** 로그인 정보를 뺀 모든 캐시를 지운다. 다른 보호자의 데이터가 남아 보이지 않게 한다. */
export function clearUserData(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0] })
}

/**
 * 현재 로그인 상태.
 * - undefined: 아직 확인 중이거나 확인에 실패함 (isPending / isError 로 구분)
 * - null: 로그인되어 있지 않음
 */
export function useSession() {
  const api = useApi()
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: ({ signal }) => api.auth.session(signal),
    staleTime: 30_000,
  })
}

export function useLogin() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginRequest) => api.auth.login(input),
    onSuccess: (session: AuthSessionResponse) => {
      clearUserData(queryClient)
      queryClient.removeQueries({ queryKey: SESSION_EXPIRED_KEY })
      queryClient.setQueryData(AUTH_QUERY_KEY, session)
    },
  })
}

/** 서버에서 로그아웃에 성공했을 때만 화면을 로그아웃 상태로 바꾼다. */
export function useLogout() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      clearUserData(queryClient)
      queryClient.setQueryData(AUTH_QUERY_KEY, null)
    },
  })
}
