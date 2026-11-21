import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { useApi } from './useApi'

/** 서버가 켜 둔 기능(시뮬레이터 등). 확인에 실패하면 오류로 남아, 켜져 있는 것처럼 보이지 않는다. */
export function useFeatures() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.features,
    queryFn: ({ signal }) => api.system.features(signal),
    staleTime: 60_000,
  })
}
