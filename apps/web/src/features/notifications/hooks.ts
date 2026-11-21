import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AlertResolveRequest } from '@tetris/shared'
import { useApi } from '@/hooks/useApi'
import { applyReadToCaches } from '@/lib/alertCache'
import { queryKeys } from '@/lib/queryKeys'
import type { AlertListFilter } from '@/services/api/types'

/** 한 번에 가져오는 개수를 뺀 조건. 더 보기는 cursor 로 이어 읽는다. */
export function useAlerts(filter: AlertListFilter) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.alerts.list(filter),
    queryFn: ({ signal }) => api.alerts.list(filter, signal),
  })
}

export function useAlertPages(filter: Omit<AlertListFilter, 'cursor'>) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: [...queryKeys.alerts.all, 'pages', filter] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.alerts.list(pageParam ? { ...filter, cursor: pageParam } : filter, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

/** 아직 종료되지 않은 알림 (진행 중 + 확인함) */
export const ACTIVE_ALERTS_FILTER: AlertListFilter = {
  status: ['OPEN', 'ACKNOWLEDGED'],
  limit: 100,
}

export function useActiveAlerts() {
  return useAlerts(ACTIVE_ALERTS_FILTER)
}

export function useAlertDetail(id: string) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.alerts.detail(id),
    queryFn: ({ signal }) => api.alerts.get(id, signal),
  })
}

/** 알림에 붙은 영상(시연용 웹캠). 영상은 알림보다 몇 초 늦게 붙으므로 화면이 열려 있는 동안 가끔 다시 읽는다. */
export function useAlertClips(id: string) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.alerts.clips(id),
    queryFn: ({ signal }) => api.alerts.clips(id, signal),
    refetchInterval: 10_000,
    retry: false,
  })
}

function useInvalidateAlerts() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
}

export function useAcknowledgeAlert(id: string) {
  const api = useApi()
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: () => api.alerts.acknowledge(id),
    onSuccess: invalidate,
    // 다른 기기에서 이미 종료한 경우(409)에도 최신 상태를 보여 준다.
    onError: invalidate,
  })
}

export function useResolveAlert(id: string) {
  const api = useApi()
  const invalidate = useInvalidateAlerts()
  return useMutation({
    mutationFn: (input: AlertResolveRequest) => api.alerts.resolve(id, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}

/**
 * 내가 읽지 않은 알림 수. 처리 상태(진행 중·확인함·종료)와 상관없이 센다.
 * 0이어도 아직 해결되지 않은 알림이 있을 수 있다. (읽음은 "봤다"는 표시일 뿐이다)
 */
export function useUnreadCount() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.alerts.unread,
    queryFn: ({ signal }) => api.alerts.unreadCount(signal),
  })
}

/**
 * 알림 하나를 읽음으로 표시한다. 화면에는 바로 반영하고, 실패하면 이전 상태로 되돌린다.
 * 읽음은 처리 상태(확인·종료)를 바꾸지 않는다.
 */
export function useMarkAlertRead() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.alerts.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.all })
      return { rollback: applyReadToCaches(queryClient, { ids: [id] }) }
    },
    onError: (_error, _id, context) => context?.rollback(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
  })
}

/** 모든 알림을 읽음으로 표시한다. 실패하면 이전 상태로 되돌린다. 처리 상태는 바꾸지 않는다. */
export function useMarkAllAlertsRead() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.alerts.markAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts.all })
      return { rollback: applyReadToCaches(queryClient, 'all') }
    },
    onError: (_error, _vars, context) => context?.rollback(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
  })
}
