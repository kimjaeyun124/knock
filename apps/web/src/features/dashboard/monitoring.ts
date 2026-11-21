import type { MovementEvent } from '@tetris/shared'
import { isNightTime } from '@/lib/night'
import type { SensorCounts } from '@/features/sensors/sensorStatus'

/**
 * 모니터링이 켜져 있는가.
 *  active   : 사용 중인 센서가 모두 연결되어 있다
 *  partial  : 사용 중인 센서 중 일부만 연결되어 있다
 *  stopped  : 사용 중인 센서가 있지만 하나도 연결되어 있지 않다
 *  inactive : 사용 중인 센서가 없다 (시작 전)
 */
export type MonitoringState = 'active' | 'partial' | 'stopped' | 'inactive'

export function monitoringState(
  counts: Pick<SensorCounts, 'active' | 'connected'>,
): MonitoringState {
  if (counts.active === 0) return 'inactive'
  if (counts.connected === 0) return 'stopped'
  return counts.connected < counts.active ? 'partial' : 'active'
}

export const MONITORING_LABELS: Record<MonitoringState, string> = {
  active: '모니터링 켜짐',
  partial: '모니터링 일부 중단',
  stopped: '모니터링 중단',
  inactive: '모니터링 시작 전',
}

/**
 * 움직임 신호의 주의 수준. 신호 하나에는 위험도가 없으므로, 야간 모니터링 시간대에 감지됐는지만 구분한다.
 * (알림의 수준은 신호들의 흐름을 보고 서버가 따로 정한다)
 */
export type EventAttention = 'night' | 'day'

export function eventAttention(
  event: Pick<MovementEvent, 'occurredAt'>,
  schedule: { nightStart: string; nightEnd: string },
): EventAttention {
  return isNightTime(new Date(event.occurredAt), schedule.nightStart, schedule.nightEnd)
    ? 'night'
    : 'day'
}
