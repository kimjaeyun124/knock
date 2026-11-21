import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SimulatorState } from '@tetris/shared'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'
import type { ApiClient } from '@/services/api/types'

/** 재생 중이거나 장애를 주입 중이면 자주, 아니면 천천히 상태를 다시 읽는다. */
export function useSimulatorState(enabled: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.simulator,
    queryFn: ({ signal }) => api.simulator.state(signal),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.running || data?.deliveryFailure.enabled || data?.sensors.some((s) => s.silenced)
        ? 2000
        : 5000
    },
  })
}

/**
 * 시뮬레이터 동작 하나. 서버가 돌려주는 최신 상태로 화면을 바로 갱신한다.
 * 신호를 보내면 알림·센서·기록이 바뀌므로 관련 데이터도 다시 읽는다.
 */
export function useSimulatorAction<Vars = void>(
  run: (api: ApiClient['simulator'], vars: Vars) => Promise<SimulatorState>,
) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: Vars) => run(api.simulator, vars),
    onSuccess: (state) => queryClient.setQueryData(queryKeys.simulator, state),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.simulator })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
    },
  })
}
