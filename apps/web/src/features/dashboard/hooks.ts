import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'

/**
 * 대시보드 데이터. DashboardService(api.dashboard)를 통해서만 가져온다.
 * 실시간 신호(센서·움직임·알림·설정 변경)가 오면 useRealtimeSync 가 다시 읽게 하고,
 * 신호를 놓쳤을 때를 대비해 1분마다도 읽는다.
 */
export function useDashboard() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: ({ signal }) => api.dashboard.summary(signal),
    refetchInterval: 60_000,
  })
}
