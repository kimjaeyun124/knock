import { alertCopy, type DataOrigin, type ZoneKind } from '@tetris/shared'
import type { AlertCandidate } from './types'

interface SensorInfo {
  id: string
  name: string
  zone: ZoneKind
  origin: DataOrigin
}

/**
 * 센서 연결 끊김. 이 센서가 그 구역의 유일한 활성 센서라면 그 구역 전체가 확인되지 않으므로 긴급,
 * 같은 구역에 다른 센서가 더 있으면 주의로 알린다.
 */
export function offlineCandidate(input: {
  sensor: SensorInfo
  silentSeconds: number
  soleSensorInZone: boolean
  now: Date
}): AlertCandidate {
  const { sensor, now } = input
  return {
    type: 'SENSOR_OFFLINE',
    severity: input.soleSensorInZone ? 'URGENT' : 'NOTICE',
    origin: sensor.origin,
    dedupeKey: `SENSOR_OFFLINE:${sensor.id}`,
    ...alertCopy.sensorOffline(sensor.name, sensor.zone, Math.floor(input.silentSeconds / 60)),
    sensorId: sensor.id,
    triggeredAt: now,
    lastEventAt: now,
    evidenceEventIds: [],
    mode: 'CONDITION',
  }
}

/**
 * 끊겼던 센서가 다시 연결되었을 때의 알림. 알려 주기만 하면 되는 정보라 만들 때부터 종료(자동 종료) 상태다.
 * 복구할 때마다 새 알림이 생기도록 시각을 키에 넣어 이전 복구 알림과 합치지 않는다.
 */
export function restoredCandidate(input: { sensor: SensorInfo; now: Date }): AlertCandidate {
  const { sensor, now } = input
  return {
    type: 'SENSOR_RESTORED',
    severity: 'INFO',
    origin: sensor.origin,
    dedupeKey: `SENSOR_RESTORED:${sensor.id}:${now.getTime()}`,
    ...alertCopy.sensorRestored(sensor.name, sensor.zone),
    sensorId: sensor.id,
    triggeredAt: now,
    lastEventAt: now,
    evidenceEventIds: [],
    mode: 'EVENT',
    resolved: true,
  }
}

/** 배터리 부족(정보)·위급(주의). 정보 수준은 목록에만 보이고 별도 알림을 보내지 않는다. */
export function batteryCandidate(input: {
  sensor: SensorInfo
  percent: number
  level: 'LOW' | 'CRITICAL'
  now: Date
}): AlertCandidate {
  const { sensor, now } = input
  const critical = input.level === 'CRITICAL'
  return {
    type: 'LOW_BATTERY',
    severity: critical ? 'NOTICE' : 'INFO',
    origin: sensor.origin,
    dedupeKey: `LOW_BATTERY:${sensor.id}`,
    ...alertCopy.lowBattery(sensor.name, input.percent, critical),
    sensorId: sensor.id,
    triggeredAt: now,
    lastEventAt: now,
    evidenceEventIds: [],
    mode: 'CONDITION',
  }
}

/** 알림을 어떤 방법으로도 전달하지 못했을 때. 사용자가 반드시 알아야 하므로 긴급이다. */
export function deliveryFailedCandidate(input: {
  origin: DataOrigin
  failedAlertTitle: string
  now: Date
}): AlertCandidate {
  return {
    type: 'DELIVERY_FAILED',
    severity: 'URGENT',
    origin: input.origin,
    dedupeKey: 'DELIVERY_FAILED',
    ...alertCopy.deliveryFailed(input.failedAlertTitle),
    sensorId: null,
    triggeredAt: input.now,
    lastEventAt: input.now,
    evidenceEventIds: [],
    mode: 'CONDITION',
  }
}
