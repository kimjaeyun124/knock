import type { ReactNode } from 'react'
import { ApiError } from '@/services/apiClient'
import { ErrorState, LoadingState, NotImplementedState } from './StateViews'

/** useQuery 결과 중 화면 상태 분기에 필요한 부분 */
export interface QueryLike<T> {
  data: T | undefined
  error: Error | null
  isPending: boolean
  isError: boolean
  refetch: () => unknown
}

interface QueryStateProps<T> {
  query: QueryLike<T>
  loadingLabel?: string
  errorTitle?: string
  children: (data: T) => ReactNode
}

/**
 * 불러오는 중 / 실패 / 성공을 한곳에서 나눈다.
 * 가장 최근 요청이 실패했다면, 이전에 받아 둔 데이터가 있어도 보여 주지 않고 실패를 알린다.
 * (오래된 성공 응답이 최신 상태처럼 보이는 것을 막는다.)
 */
export function QueryState<T>({ query, loadingLabel, errorTitle, children }: QueryStateProps<T>) {
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.kind === 'not-implemented') {
      return <NotImplementedState message={query.error.message} />
    }
    return (
      <ErrorState
        {...(errorTitle ? { title: errorTitle } : {})}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    )
  }
  if (query.isPending || query.data === undefined) {
    return <LoadingState {...(loadingLabel ? { label: loadingLabel } : {})} />
  }
  return <>{children(query.data)}</>
}
