import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertPreferencesInputSchema,
  DetectionSettingsInputSchema,
  type AlertPreferencesInput,
  type Channel,
  type DetectionSettingsInput,
  type PushSubscriptionInput,
} from '@tetris/shared'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'

export function useIntegrations() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.integrations,
    queryFn: ({ signal }) => api.integrations.list(signal),
    // 서버가 아직 제공하지 않는 기능은 다시 시도해도 같다.
    retry: false,
  })
}

export function useSensorAdapters() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.sensorAdapters,
    queryFn: ({ signal }) => api.system.sensorAdapters(signal),
    retry: false,
  })
}

export function useBackupStatus() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.backupStatus,
    queryFn: ({ signal }) => api.system.backupStatus(signal),
    retry: false,
  })
}

export function useDetectionSettings() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.settings.detection,
    queryFn: ({ signal }) => api.settings.getDetection(signal),
  })
}

export function useUpdateDetectionSettings() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DetectionSettingsInput) => api.settings.updateDetection(input),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings.detection, settings),
  })
}

export function useAlertPreferences() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.settings.alerts,
    queryFn: ({ signal }) => api.settings.getAlertPreferences(signal),
  })
}

export function useUpdateAlertPreferences() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AlertPreferencesInput) => api.settings.updateAlertPreferences(input),
    onSuccess: (prefs) => queryClient.setQueryData(queryKeys.settings.alerts, prefs),
  })
}

export function useChannelTest() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (channel: Channel) => api.notifications.test(channel),
    // 테스트가 성공하면 "마지막 전달 성공 시각"이 바뀐다.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.integrations }),
  })
}

export function usePushConfig() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.pushConfig,
    queryFn: ({ signal }) => api.push.config(signal),
    staleTime: 60_000,
  })
}

export function usePushSubscriptions(enabled: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.pushSubscriptions,
    queryFn: ({ signal }) => api.push.list(signal),
    enabled,
  })
}

export function useRemovePushSubscription() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.push.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.pushSubscriptions }),
  })
}

export function useSubscribePush() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PushSubscriptionInput) => api.push.subscribe(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pushSubscriptions })
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations })
    },
  })
}

/**
 * 감지 설정 일부만 바꿔 저장한다. 서버 API 는 항목을 통째로 받으므로,
 * 저장하는 순간 서버에 있는 최신 값을 읽어 바꿀 항목만 덮어써서 보낸다. (다른 화면에서 바꾼 값을 되돌리지 않는다)
 * 보내기 전에 같은 규칙으로 검증하고, 서버가 거부하면 오류를 그대로 던져 "저장되었다"고 보이지 않게 한다.
 */
export function usePatchDetection() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<DetectionSettingsInput>) => {
      const { updatedAt: _updatedAt, ...current } = await api.settings.getDetection()
      const parsed = DetectionSettingsInputSchema.safeParse({ ...current, ...patch })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? '설정 값을 확인해 주세요.')
      }
      return api.settings.updateDetection(parsed.data)
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings.detection, settings)
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

/** 받을 알림 일부만 바꿔 저장한다. (usePatchDetection 과 같은 방식) */
export function usePatchAlertPreferences() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<AlertPreferencesInput>) => {
      const { updatedAt: _updatedAt, ...current } = await api.settings.getAlertPreferences()
      const parsed = AlertPreferencesInputSchema.safeParse({ ...current, ...patch })
      if (!parsed.success) throw new Error('알림 설정 값을 확인해 주세요.')
      return api.settings.updateAlertPreferences(parsed.data)
    },
    onSuccess: (prefs) => queryClient.setQueryData(queryKeys.settings.alerts, prefs),
  })
}
