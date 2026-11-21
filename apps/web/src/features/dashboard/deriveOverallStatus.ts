import type { Alert, AlertType, Sensor } from '@tetris/shared'
import { severityRank } from '@tetris/shared'

/**
 * 대시보드의 큰 상태. (계획서 5.3)
 * - monitoring: 활성 센서가 모두 연결되어 있고 열린 알림이 없음 → "정상"
 * - incomplete: 알림은 없지만 모니터링이 온전하지 않음 (센서 일부 끊김·배터리·첫 신호 대기·전달 실패) → "주의"
 * - attention / urgent: 열린 움직임 알림이 있음 → "확인 필요" (urgent 는 "즉시 확인 권장"을 함께 표시)
 * - disconnected: 사용 중인 센서가 모두 끊겼거나, 이 화면이 서버와 연결되지 않아 지금 상태를 알 수 없음 → "연결 끊김"
 * - unknown: 상태를 확인하지 못함. 정상처럼 보이지 않도록 따로 둔다.
 */
export type OverallLevel =
  'monitoring' | 'incomplete' | 'attention' | 'urgent' | 'disconnected' | 'unknown'

export const OVERALL_LEVEL_LABELS: Record<OverallLevel, string> = {
  monitoring: '정상',
  incomplete: '주의',
  attention: '확인 필요',
  urgent: '확인 필요',
  disconnected: '연결 끊김',
  unknown: '상태 확인 불가',
}

/** 상태 이름 아래에 붙이는 한 줄 설명. 안전을 보장하는 표현을 쓰지 않는다. */
export const OVERALL_LEVEL_HINTS: Record<OverallLevel, string> = {
  monitoring:
    '센서가 보낸 움직임 신호를 기준으로 한 표시입니다. 어르신의 안전을 보장하는 것은 아닙니다.',
  incomplete: '움직임을 놓칠 수 있는 부분이 있습니다. 아래 내용을 확인해 주세요.',
  attention: '센서가 움직임 신호를 감지했습니다. 어르신께 직접 확인해 주세요.',
  urgent: '센서가 움직임 신호를 감지했습니다. 가능한 빨리 어르신께 직접 확인해 주세요.',
  disconnected: '신호를 받지 못해 지금의 움직임을 확인할 수 없습니다.',
  unknown: '상태를 확인하지 못했습니다. 정상으로 보지 말고 다시 확인해 주세요.',
}

export interface OverallStatusModel {
  level: OverallLevel
  headline: string
  /** 모니터링이 온전하지 않은 이유. 열린 알림이 있어도 함께 보여 준다. */
  reasons: string[]
  /** 이 상태를 만든 알림이 시뮬레이션으로 만들어진 것인가. 실제 상황으로 오해하지 않게 따로 표시한다. */
  simulated?: boolean
  /** 이 상태를 만든 알림의 ID. 상세 화면으로 바로 이어 주는 데 쓴다. */
  alertId?: string
}

/** 움직임을 근거로 만들어지는 알림 유형. 센서 상태·전달 실패는 따로 센다. */
const MOVEMENT_ALERT_TYPES: readonly AlertType[] = [
  'BED_AREA_ACTIVITY',
  'BED_TO_PATH',
  'ENTRANCE_APPROACH',
  'REPEATED_MOVEMENT',
]

export const MONITORING_HEADLINE = '최근 감지된 주의 이벤트가 없습니다'

function incompleteReasons(sensors: readonly Sensor[], activeAlerts: readonly Alert[]): string[] {
  const reasons: string[] = []
  const active = sensors.filter((sensor) => sensor.isActive)

  if (active.length === 0) {
    reasons.push('사용 중인 센서가 없어 움직임을 확인할 수 없습니다.')
    return appendDeliveryFailure(reasons, activeAlerts)
  }

  const offline = active.filter((sensor) => sensor.state === 'OFFLINE').length
  if (offline > 0) reasons.push(`센서 ${offline}개의 연결이 끊겨 있습니다.`)

  const pending = active.filter((sensor) => sensor.state === 'PENDING').length
  if (pending > 0) reasons.push(`센서 ${pending}개가 아직 첫 신호를 보내지 않았습니다.`)

  const lowBattery = active.filter(
    (sensor) => sensor.batteryLevel === 'LOW' || sensor.batteryLevel === 'CRITICAL',
  ).length
  if (lowBattery > 0) reasons.push(`센서 ${lowBattery}개의 배터리가 부족합니다.`)

  return appendDeliveryFailure(reasons, activeAlerts)
}

function appendDeliveryFailure(reasons: string[], activeAlerts: readonly Alert[]): string[] {
  if (activeAlerts.some((alert) => alert.type === 'DELIVERY_FAILED')) {
    reasons.push('보호자에게 알림을 전달하지 못한 기록이 있습니다.')
  }
  return reasons
}

/** 진행 중인 알림 중 가장 높은 수준(같으면 최근) */
function topMovementAlert(activeAlerts: readonly Alert[]): Alert | null {
  const open = activeAlerts.filter(
    (alert) => alert.status === 'OPEN' && MOVEMENT_ALERT_TYPES.includes(alert.type),
  )
  let top: Alert | null = null
  for (const alert of open) {
    if (
      top === null ||
      severityRank(alert.severity) > severityRank(top.severity) ||
      (alert.severity === top.severity && alert.triggeredAt > top.triggeredAt)
    ) {
      top = alert
    }
  }
  return top
}

/**
 * 센서와 진행 중인 알림으로 대시보드 상태를 정한다.
 * 알림 수준과 "모니터링이 온전하지 않은 이유"는 따로 계산해 항상 함께 돌려준다.
 */
export function deriveOverallStatus(
  sensors: readonly Sensor[],
  activeAlerts: readonly Alert[],
): OverallStatusModel {
  const reasons = incompleteReasons(sensors, activeAlerts)
  const top = topMovementAlert(activeAlerts)

  const simulated = top?.origin === 'SIMULATED'
  if (top && top.severity === 'URGENT') {
    return { level: 'urgent', headline: top.title, reasons, simulated, alertId: top.id }
  }
  if (top && top.severity === 'NOTICE') {
    return { level: 'attention', headline: top.title, reasons, simulated, alertId: top.id }
  }
  if (reasons.length > 0) {
    const active = sensors.filter((sensor) => sensor.isActive)
    const allOffline = active.length > 0 && active.every((sensor) => sensor.state === 'OFFLINE')
    return {
      level: allOffline ? 'disconnected' : 'incomplete',
      headline: allOffline ? '사용 중인 모든 센서의 연결이 끊겨 있습니다.' : (reasons[0] ?? ''),
      // 첫 이유는 제목에 쓰였으므로(끊긴 센서 수) 나머지만 목록으로 보여 준다.
      reasons: reasons.slice(1),
    }
  }
  return { level: 'monitoring', headline: MONITORING_HEADLINE, reasons: [] }
}

/** 이전에 받아 둔 상태를 "마지막으로 확인한 상태" 문장으로 바꾼다. 긴급은 긴급이라고 남겨 둔다. */
function lastKnownText(lastKnown: OverallStatusModel): string {
  const label =
    lastKnown.level === 'urgent' ? '즉시 확인 권장' : OVERALL_LEVEL_LABELS[lastKnown.level]
  return `마지막으로 확인한 상태: ${label} — ${lastKnown.headline}`
}

/**
 * 센서나 알림을 불러오지 못했거나(unknown), 이 화면이 서버와 연결되어 있지 않을 때(disconnected).
 * "알림 없음"처럼 보이지 않게 한다. 이전에 받아 둔 상태가 있으면 "마지막으로 확인한 상태"로만 덧붙인다.
 */
export function unavailableStatus(
  level: Extract<OverallLevel, 'unknown' | 'disconnected'>,
  message: string,
  lastKnown?: OverallStatusModel,
): OverallStatusModel {
  const reasons =
    lastKnown && lastKnown.level !== 'unknown' && lastKnown.level !== 'disconnected'
      ? [lastKnownText(lastKnown)]
      : []
  return { level, headline: message, reasons }
}

export function unknownOverallStatus(
  message: string,
  lastKnown?: OverallStatusModel,
): OverallStatusModel {
  return unavailableStatus('unknown', message, lastKnown)
}
