import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { HealthResponse } from '@tetris/shared'
import { queryKeys } from '@/lib/queryKeys'
import { ApiError, UNREACHABLE_KINDS } from '@/services/apiClient'
import { useApi } from './useApi'

export type ServerStatus =
  | { state: 'checking' }
  | { state: 'ok'; health: HealthResponse }
  /** unreachable: 서버까지 닿지 못했다(네트워크). false 면 서버가 응답은 했지만 정상이 아니다. */
  | { state: 'error'; message: string; unreachable: boolean }

/**
 * 쿼리 결과를 화면용 상태로 바꾼다.
 * 이전에 성공한 데이터가 남아 있어도 "가장 최근 확인"이 실패했다면 error다.
 * (오래된 성공 응답 때문에 서버가 정상으로 보이는 일을 막는다.)
 */
export function toServerStatus(
  query: Pick<UseQueryResult<HealthResponse>, 'isError' | 'error' | 'isPending' | 'data'>,
): ServerStatus {
  if (query.isError) {
    return {
      state: 'error',
      message: query.error?.message ?? '서버 상태를 확인하지 못했습니다.',
      unreachable: query.error instanceof ApiError && UNREACHABLE_KINDS.includes(query.error.kind),
    }
  }
  if (query.isPending || query.data === undefined) return { state: 'checking' }
  return { state: 'ok', health: query.data }
}

export function useServerStatus(): ServerStatus {
  const api = useApi()
  const query = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.health.get(signal),
    refetchInterval: 30_000,
  })
  return toServerStatus(query)
}
