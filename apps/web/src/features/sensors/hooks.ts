import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Sensor,
  SensorCreate,
  SensorListResponse,
  SensorResponse,
  SensorUpdate,
} from '@tetris/shared'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'

export function useSensors() {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.sensors.list,
    queryFn: ({ signal }) => api.sensors.list(signal),
  })
}

interface UseSensorOptions {
  /** 이 간격(ms)마다 다시 읽는다. 첫 신호를 기다리는 "연결 확인"에서 쓴다. */
  pollMs?: number
}

export function useSensor(id: string, options: UseSensorOptions = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.sensors.detail(id),
    queryFn: ({ signal }) => api.sensors.get(id, signal),
    ...(options.pollMs ? { refetchInterval: options.pollMs } : {}),
  })
}

/** 센서가 바뀌면 목록·상세·알림(센서 이름 등)을 다시 읽는다. */
function useInvalidateSensors() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
  }
}

export function useCreateSensor() {
  const api = useApi()
  const invalidate = useInvalidateSensors()
  return useMutation({
    mutationFn: (input: SensorCreate) => api.sensors.create(input),
    onSuccess: invalidate,
  })
}

/** 값이 있는 항목만 골라 센서에 덮어쓴다. (undefined 로 기존 값을 지우지 않는다) */
function applyPatch(sensor: Sensor, patch: SensorUpdate): Sensor {
  return {
    ...sensor,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.zone !== undefined ? { zone: patch.zone } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    ...(patch.offlineAfterSeconds !== undefined
      ? {
          offlineAfterSeconds: patch.offlineAfterSeconds,
          // 가구 기본으로 돌아가는 경우(null)의 실제 기준은 서버 값으로 다시 맞춘다.
          effectiveOfflineAfterSeconds:
            patch.offlineAfterSeconds ?? sensor.effectiveOfflineAfterSeconds,
        }
      : {}),
  }
}

/**
 * 센서 수정. 화면에는 바로 반영하되(낙관적 갱신), 저장에 실패하면 수정 전 값으로 되돌린다.
 * 어느 쪽이든 끝나면 서버 값으로 다시 맞춘다. (화면이 서버와 다른 값으로 남지 않게)
 */
export function useUpdateSensor(id: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSensors()
  return useMutation({
    mutationFn: (input: SensorUpdate) => api.sensors.update(id, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sensors.all })
      const detail = queryClient.getQueryData<SensorResponse>(queryKeys.sensors.detail(id))
      const list = queryClient.getQueryData<SensorListResponse>(queryKeys.sensors.list)
      if (detail) {
        queryClient.setQueryData<SensorResponse>(queryKeys.sensors.detail(id), {
          sensor: applyPatch(detail.sensor, input),
        })
      }
      if (list) {
        queryClient.setQueryData<SensorListResponse>(queryKeys.sensors.list, {
          sensors: list.sensors.map((sensor) =>
            sensor.id === id ? applyPatch(sensor, input) : sensor,
          ),
        })
      }
      return { detail, list }
    },
    onError: (_error, _input, previous) => {
      if (previous?.detail) {
        queryClient.setQueryData(queryKeys.sensors.detail(id), previous.detail)
      }
      if (previous?.list) queryClient.setQueryData(queryKeys.sensors.list, previous.list)
    },
    onSettled: invalidate,
  })
}

export function useRotateSensorToken(id: string) {
  const api = useApi()
  const invalidate = useInvalidateSensors()
  return useMutation({
    mutationFn: () => api.sensors.rotateToken(id),
    onSuccess: invalidate,
  })
}

export function useDeleteSensor(id: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.sensors.remove(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.sensors.detail(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
    },
  })
}

/** 시뮬레이션 센서(구역별 1개)를 만든다. 실제 장치가 아니다. */
export function useEnsureSimulatedSensors() {
  const api = useApi()
  const invalidate = useInvalidateSensors()
  return useMutation({
    mutationFn: () => api.simulator.ensureSensors(),
    onSuccess: invalidate,
  })
}
