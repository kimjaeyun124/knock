import type { BatteryLevel, SensorState } from '@tetris/shared'

/**
 * 센서 연결 상태. 저장하지 않고 마지막 신호 시각으로 그때그때 계산한다.
 * (순수 함수: DB·시계에 직접 접근하지 않는다)
 */
export function deriveSensorState(input: {
  isActive: boolean
  lastSeenAt: Date | null
  now: Date
  offlineAfterSeconds: number
}): SensorState {
  if (!input.isActive) return 'DISABLED'
  if (!input.lastSeenAt) return 'PENDING'
  const silentMs = input.now.getTime() - input.lastSeenAt.getTime()
  return silentMs > input.offlineAfterSeconds * 1000 ? 'OFFLINE' : 'ONLINE'
}

export function deriveBatteryLevel(
  percent: number | null,
  thresholds: { lowBatteryPercent: number; criticalBatteryPercent: number },
): BatteryLevel {
  if (percent === null) return 'UNKNOWN'
  if (percent <= thresholds.criticalBatteryPercent) return 'CRITICAL'
  if (percent <= thresholds.lowBatteryPercent) return 'LOW'
  return 'OK'
}

/**
 * 센서 상태 이력(CONNECTED)에 남기는 설명. 처음 연결과 끊겼다 돌아온 복구를 가르는 데 쓴다.
 * (둘 다 kind 는 CONNECTED 라, 구분은 이 설명으로 한다)
 */
export const CONNECTED_DETAIL = {
  FIRST: '첫 신호를 받았습니다.',
  RESTORED: '연결이 복구되었습니다.',
} as const

/**
 * 이 센서에 적용할 연결 끊김 기준(초). 센서마다 신호 간격이 다르므로(배터리 센서는 간격이 길다)
 * 센서별 값이 있으면 그것을, 없으면 가구 기본을 쓴다.
 */
export function effectiveOfflineAfterSeconds(
  sensor: { offlineAfterSeconds: number | null },
  thresholds: { offlineAfterSeconds: number },
): number {
  return sensor.offlineAfterSeconds ?? thresholds.offlineAfterSeconds
}
