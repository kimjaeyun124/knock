import type { Sensor, SensorKind } from '@tetris/shared'

/** 화면에 보이는 센서 유형 이름 */
export const SENSOR_KIND_LABELS: Record<SensorKind, string> = {
  MOTION: '움직임 감지 센서',
}

/**
 * 센서의 표시 상태. 연결(state)과 배터리(batteryLevel)는 서로 독립된 값이다.
 * 연결은 정상인데 배터리만 부족한 센서는 LOW_BATTERY 이고, 연결이 끊긴 센서는 배터리와 상관없이 OFFLINE 이다.
 *  ONLINE      : 연결됨, 배터리 충분(또는 정보 없음)
 *  LOW_BATTERY : 연결됨, 배터리 부족·위급
 *  OFFLINE     : 연결 끊김
 *  UNKNOWN     : 아직 첫 신호를 받지 못해 연결을 확인하지 못함
 *  DISABLED    : 사용자가 꺼 둠 (이 상태는 문제가 아니다)
 */
export type SensorDisplayStatus = 'ONLINE' | 'LOW_BATTERY' | 'OFFLINE' | 'UNKNOWN' | 'DISABLED'

export function isLowBattery(sensor: Pick<Sensor, 'batteryLevel'>): boolean {
  return sensor.batteryLevel === 'LOW' || sensor.batteryLevel === 'CRITICAL'
}

export function sensorDisplayStatus(
  sensor: Pick<Sensor, 'state' | 'batteryLevel'>,
): SensorDisplayStatus {
  switch (sensor.state) {
    case 'DISABLED':
      return 'DISABLED'
    case 'OFFLINE':
      return 'OFFLINE'
    case 'PENDING':
      return 'UNKNOWN'
    case 'ONLINE':
      return isLowBattery(sensor) ? 'LOW_BATTERY' : 'ONLINE'
  }
}

export interface SensorCounts {
  /** 등록된 센서 전체 */
  total: number
  /** 사용 중(켜 둔) 센서 */
  active: number
  /** 사용 중이면서 연결된 센서 */
  connected: number
  /** 연결되어 있고 배터리도 부족하지 않은 센서 — "정상 작동 중" */
  working: number
}

export function countSensors(sensors: readonly Sensor[]): SensorCounts {
  const active = sensors.filter((sensor) => sensor.isActive)
  const connected = active.filter((sensor) => sensor.state === 'ONLINE')
  return {
    total: sensors.length,
    active: active.length,
    connected: connected.length,
    working: connected.filter((sensor) => !isLowBattery(sensor)).length,
  }
}
