import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HouseholdUpdate, RegisterRequest } from '@tetris/shared'
import { AUTH_QUERY_KEY } from '@/hooks/useAuth'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'

export function useHousehold() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.household,
    queryFn: ({ signal }) => api.household.get(signal),
  })
}

export function useUpdateHousehold() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: HouseholdUpdate) => api.household.update(input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.household, data)
      // 상단 메뉴 등에서 쓰는 로그인 정보의 호칭도 최신으로
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY })
    },
  })
}

/**
 * 모니터링 시간 저장. 서버는 감지 설정을 통째로 받으므로, 지금 저장된 값에 시간만 바꿔 보낸다.
 * (저장된 값을 읽지 못했다면 다른 설정을 덮어쓰지 않도록 저장하지 않고 실패로 알린다.)
 */
export function useSaveSchedule() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nightStart: string; nightEnd: string }) => {
      const { updatedAt: _updatedAt, ...current } = await api.settings.getDetection()
      return api.settings.updateDetection({ ...current, ...input })
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings.detection, settings)
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

/** 서버에 보호자가 없어 첫 계정을 만들어야 하는가. 확인에 실패하면 오류로 남는다. */
export function useSetupStatus() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: ({ signal }) => api.auth.setupStatus(signal),
    staleTime: 0,
  })
}

export function useRegister() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterRequest) => api.auth.register(input),
    onSuccess: (session) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, session)
      queryClient.setQueryData(queryKeys.setupStatus, { needsSetup: false })
    },
  })
}
