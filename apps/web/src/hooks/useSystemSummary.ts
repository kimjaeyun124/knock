import type { Alert, Sensor } from '@tetris/shared'
import { useActiveAlerts } from '@/features/notifications/hooks'
import { useSensors } from '@/features/sensors/hooks'
import type { QueryLike } from '@/components/common/QueryState'

export type Loadable<T> =
  { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; value: T }

export interface SensorSummary {
  /** 사용 중인 센서 수 */
  active: number
  offline: number
  pending: number
  /** 사용 중인 시뮬레이션 센서 수 */
  simulated: number
}

export interface SystemSummary {
  sensors: Loadable<SensorSummary>
  /** 아직 종료되지 않은 "알림 전달 실패" 알림 수 */
  deliveryFailures: Loadable<number>
}

function toLoadable<T, R>(query: QueryLike<T>, failure: string, pick: (data: T) => R): Loadable<R> {
  // 가장 최근 요청이 실패했다면 이전에 받은 데이터가 있어도 실패로 취급한다.
  if (query.isError) return { state: 'error', message: query.error?.message ?? failure }
  if (query.isPending || query.data === undefined) return { state: 'loading' }
  return { state: 'ready', value: pick(query.data) }
}

export function summarizeSensors(sensors: readonly Sensor[]): SensorSummary {
  const active = sensors.filter((sensor) => sensor.isActive)
  return {
    active: active.length,
    offline: active.filter((sensor) => sensor.state === 'OFFLINE').length,
    pending: active.filter((sensor) => sensor.state === 'PENDING').length,
    simulated: active.filter((sensor) => sensor.origin === 'SIMULATED').length,
  }
}

export function countDeliveryFailures(alerts: readonly Alert[]): number {
  return alerts.filter((alert) => alert.type === 'DELIVERY_FAILED').length
}

/** 상단 상태 띠가 보여 줄 센서·전달 상태 요약 */
export function useSystemSummary(): SystemSummary {
  const sensors = useSensors()
  const alerts = useActiveAlerts()
  return {
    sensors: toLoadable(sensors, '센서 상태를 확인하지 못했습니다.', (data) =>
      summarizeSensors(data.sensors),
    ),
    deliveryFailures: toLoadable(alerts, '알림 상태를 확인하지 못했습니다.', (data) =>
      countDeliveryFailures(data.alerts),
    ),
  }
}
