import {
  ZONE_LABELS,
  severityRank,
  type AlertSeverity,
  type AlertType,
  type DetectionSettingsInput,
  type SensorStatusLogKind,
  type TimelineAttention,
  type TimelineEventType,
  type ZoneKind,
  WEEKDAY_LABELS,
} from '@tetris/shared'
import { REPEATED_THRESHOLD, REPEATED_WINDOW_MINUTES } from './rules/movement-rules'
import { CONNECTED_DETAIL } from './sensor-status'

/**
 * 움직임 기록의 판단 규칙. 순수 함수 — DB·시계를 쓰지 않는다.
 * 유형·주의 수준은 저장하지 않고 이 규칙으로 그때그때 정한다. (원본 기록은 바꾸지 않는다)
 *
 * 단일 움직임 센서의 신호로 낙상이나 외출을 확정하지 않는다. 그래서 침대 주변·현관 관련 유형은
 * 모두 "센서 위치와 규칙에 따른 추정"이라고 설명에 밝힌다.
 */

/** 움직임 기록 이벤트 ID 의 접두사. 움직임 신호는 mov_, 센서 상태 변화는 sta_ */
export const MOVEMENT_PREFIX = 'mov_'
export const STATUS_PREFIX = 'sta_'

/** 침대 주변 규칙이 근거로 삼는 알림 유형 */
export const BED_RULE_ALERT_TYPES = [
  'BED_AREA_ACTIVITY',
  'BED_TO_PATH',
] as const satisfies readonly AlertType[]

export function isBedRuleAlert(type: AlertType): boolean {
  return (BED_RULE_ALERT_TYPES as readonly AlertType[]).includes(type)
}

// 움직임 신호의 유형(BED_EXIT_CANDIDATE·ENTRANCE_ACTIVITY·MOTION_DETECTED)은 신호를 받을 때
// 판단 엔진이 정해 저장한다. (rules/classify.ts · MovementEvent.eventClass)

/** 움직임 신호의 주의 수준: 연결된 알림 중 가장 높은 심각도. 알림과 연결되지 않으면 NORMAL */
export function movementAttention(severities: readonly AlertSeverity[]): TimelineAttention {
  let top: AlertSeverity | null = null
  for (const severity of severities) {
    if (top === null || severityRank(severity) > severityRank(top)) top = severity
  }
  return top ?? 'NORMAL'
}

/** 센서 상태 변화의 유형. 배터리 회복(BATTERY_OK)은 기록 대상이 아니라 null */
export function statusEventType(kind: SensorStatusLogKind): TimelineEventType | null {
  switch (kind) {
    case 'DISCONNECTED':
      return 'SENSOR_OFFLINE'
    case 'CONNECTED':
      return 'SENSOR_RESTORED'
    case 'BATTERY_LOW':
    case 'BATTERY_CRITICAL':
      return 'LOW_BATTERY'
    case 'BATTERY_OK':
      return null
  }
}

/** 센서 상태 변화의 주의 수준. (연결된 알림의 심각도와는 따로 보여 준다) */
export function statusAttention(kind: SensorStatusLogKind): TimelineAttention {
  switch (kind) {
    case 'DISCONNECTED':
    case 'BATTERY_CRITICAL':
      return 'NOTICE'
    case 'BATTERY_LOW':
      return 'INFO'
    case 'CONNECTED':
    case 'BATTERY_OK':
      return 'NORMAL'
  }
}

/** 이 종류의 센서 상태 변화에 대응하는 알림 유형 */
export function statusAlertType(kind: SensorStatusLogKind): AlertType | null {
  if (kind === 'DISCONNECTED') return 'SENSOR_OFFLINE'
  if (kind === 'CONNECTED') return 'SENSOR_RESTORED'
  if (kind === 'BATTERY_LOW' || kind === 'BATTERY_CRITICAL') return 'LOW_BATTERY'
  return null
}

/** 센서 상태 변화 이벤트와 같은 때 만들어진 알림으로 보는 시간 범위(ms) */
export const STATUS_ALERT_LINK_WINDOW_MS = 2 * 60 * 1000

const quote = (name: string): string => `'${name}'`

export interface DescribeInput {
  type: TimelineEventType
  sensorName: string
  zone: ZoneKind
  /** 센서 상태 이벤트의 기록된 설명(예: "7분 이상 신호가 없습니다.") */
  detail?: string | null
  critical?: boolean
}

/** 이벤트 설명. 추정 이벤트는 추정이라고 밝히고, 상황을 단정하지 않는다. */
export function describeEvent(input: DescribeInput): string {
  const sensor = `${ZONE_LABELS[input.zone]} 센서(${input.sensorName})`
  switch (input.type) {
    case 'MOTION_DETECTED':
      return `${sensor}에서 움직임 신호가 있었습니다.`
    case 'ENTRANCE_ACTIVITY':
      return `${sensor}에서 움직임 신호가 있었습니다. 현관 주변의 움직임으로 추정되며, 밖으로 나갔는지는 알 수 없습니다.`
    case 'BED_EXIT_CANDIDATE':
      return `${sensor}의 움직임 신호가 침대 주변 규칙에 사용되었습니다. 센서 위치와 규칙에 따른 추정이며, 일어나 움직였는지는 확정하지 않습니다.`
    case 'SENSOR_OFFLINE':
      return `${quote(input.sensorName)} 센서의 신호가 끊겼습니다.${input.detail ? ` ${input.detail}` : ''}`
    case 'SENSOR_RESTORED':
      // 상태 이력의 설명으로 처음 연결과 끊겼다 돌아온 복구를 가른다. 설명이 없으면 둘 다 맞는 문장을 쓴다.
      if (input.detail === CONNECTED_DETAIL.FIRST) {
        return `${quote(input.sensorName)} 센서가 처음 연결되었습니다. 첫 신호를 받았습니다.`
      }
      if (input.detail === CONNECTED_DETAIL.RESTORED) {
        return `${quote(input.sensorName)} 센서의 끊겼던 연결이 복구되었습니다.`
      }
      return `${quote(input.sensorName)} 센서가 연결 상태가 되었습니다. (처음 연결되었거나, 끊겼던 연결이 돌아온 경우입니다)`
    case 'LOW_BATTERY':
      return input.critical
        ? `${quote(input.sensorName)} 센서의 배터리가 거의 남지 않았습니다.${input.detail ? ` ${input.detail}` : ''}`
        : `${quote(input.sensorName)} 센서의 배터리가 부족합니다.${input.detail ? ` ${input.detail}` : ''}`
  }
}

const SENSITIVITY_LABEL = { LOW: '낮음', MEDIUM: '보통', HIGH: '높음' } as const

/** "매일" 또는 "월·수·금 밤" 처럼 모니터링하는 요일. 모니터링을 껐다면 그 사실을 먼저 밝힌다. */
function scheduleText(settings: DetectionSettingsInput): string {
  if (!settings.monitoringEnabled)
    return '(지금은 모니터링이 꺼져 있어 움직임 알림이 만들어지지 않습니다)'
  if (settings.activeWeekdays.length === 7) return '매일'
  return settings.activeWeekdays.map((day) => WEEKDAY_LABELS[day]).join('·')
}

/** 알림 유형별 규칙 설명. 현재 감지 설정 기준이다. */
export function ruleText(alertType: AlertType, settings: DetectionSettingsInput): string {
  const night = `${scheduleText(settings)} 야간(${settings.nightStart}~${settings.nightEnd})`
  switch (alertType) {
    case 'BED_AREA_ACTIVITY':
      return `${night}에 침대 주변 센서에서 움직임이 감지되면 알립니다. (민감도 높음일 때만, 현재 ${SENSITIVITY_LABEL[settings.sensitivity]})`
    case 'BED_TO_PATH':
      return `${night}에 이동 경로 센서의 신호가 침대 주변 센서의 신호 뒤 ${settings.sequenceWindowMinutes}분 안에 이어지면 알립니다. (민감도 보통 이상, 현재 ${SENSITIVITY_LABEL[settings.sensitivity]})`
    case 'ENTRANCE_APPROACH':
      return `${night}에 현관 센서에서 움직임이 감지되면 알립니다. (모든 민감도)`
    case 'REPEATED_MOVEMENT':
      return `${night}에 ${REPEATED_WINDOW_MINUTES}분 안에 구역이 ${REPEATED_THRESHOLD[settings.sensitivity]}번 이상 바뀌면 알립니다. (현재 민감도 ${SENSITIVITY_LABEL[settings.sensitivity]})`
    case 'SENSOR_OFFLINE':
      return `센서 신호가 ${Math.round(settings.offlineAfterSeconds / 60)}분 넘게 없으면 연결 끊김으로 보고 알립니다.`
    case 'LOW_BATTERY':
      return `배터리가 ${settings.lowBatteryPercent}% 이하면 부족(참고), ${settings.criticalBatteryPercent}% 이하면 위급(주의)으로 봅니다.`
    case 'SENSOR_RESTORED':
      return '끊겼던 센서에서 신호가 다시 들어오면 정보로 알립니다.'
    case 'DELIVERY_FAILED':
      return '알림을 어떤 방법으로도 전달하지 못했을 때 알립니다.'
  }
}

/** 판단에 사용된 규칙. 연결된 알림이 있으면 그 알림의 규칙(가장 높은 심각도), 없으면 기록만 하는 이유 */
export function ruleFor(input: {
  type: TimelineEventType
  alerts: readonly { type: AlertType; severity: AlertSeverity }[]
  settings: DetectionSettingsInput
}): { text: string; alertType: AlertType | null } {
  const sorted = [...input.alerts].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  )
  const top = sorted[0]
  if (top) return { text: ruleText(top.type, input.settings), alertType: top.type }
  switch (input.type) {
    case 'SENSOR_RESTORED':
      return {
        text: '센서에서 신호가 들어와 연결 상태가 되면 "연결 복구"로 기록합니다. (처음 연결도 포함)',
        alertType: null,
      }
    case 'SENSOR_OFFLINE':
      return { text: ruleText('SENSOR_OFFLINE', input.settings), alertType: null }
    case 'LOW_BATTERY':
      return { text: ruleText('LOW_BATTERY', input.settings), alertType: null }
    default:
      return {
        text: '이 신호 하나는 알림 규칙에 해당하지 않아 기록으로만 남습니다.',
        alertType: null,
      }
  }
}
