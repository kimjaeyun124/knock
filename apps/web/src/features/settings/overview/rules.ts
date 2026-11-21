import {
  REPEATED_THRESHOLD,
  REPEATED_WINDOW_MINUTES,
  SENSITIVITY_LABELS,
  type DetectionSettings,
  type Sensitivity,
  type ZoneKind,
} from '@tetris/shared'
import { describeWeekdays } from '@/lib/night'

/** 서버 규칙(apps/server/src/domain/rules/movement-rules.ts)을 설정 화면용 문장으로 옮긴 것. 같은 상수를 쓴다. */
export type MovementRuleType =
  'ENTRANCE_APPROACH' | 'BED_TO_PATH' | 'REPEATED_MOVEMENT' | 'BED_AREA_ACTIVITY'

function when(settings: Pick<DetectionSettings, 'activeWeekdays' | 'nightStart' | 'nightEnd'>) {
  return `${describeWeekdays(settings.activeWeekdays)} 밤(${settings.nightStart}~${settings.nightEnd})에`
}

export function ruleSummary(
  type: MovementRuleType,
  settings: Pick<
    DetectionSettings,
    'activeWeekdays' | 'nightStart' | 'nightEnd' | 'sequenceWindowMinutes'
  >,
): string {
  const t = when(settings)
  switch (type) {
    case 'ENTRANCE_APPROACH':
      return `${t} 현관 센서에서 움직임이 감지되면 알립니다. 민감도와 상관없이 만들어지며, 즉시 확인 권장 수준입니다.`
    case 'BED_TO_PATH':
      return `${t} 침대 주변 센서의 신호 뒤 ${settings.sequenceWindowMinutes}분 안에 이동 경로 센서의 신호가 이어지면 알립니다. 이동 경로 센서의 민감도가 ‘${SENSITIVITY_LABELS.MEDIUM}’ 이상일 때만 만들어집니다.`
    case 'REPEATED_MOVEMENT':
      return `${t} ${REPEATED_WINDOW_MINUTES}분 안에 구역이 바뀐 횟수가 기준 이상이면 알립니다. 기준은 민감도 ‘${SENSITIVITY_LABELS.LOW}’ ${REPEATED_THRESHOLD.LOW}번 · ‘${SENSITIVITY_LABELS.MEDIUM}’ ${REPEATED_THRESHOLD.MEDIUM}번 · ‘${SENSITIVITY_LABELS.HIGH}’ ${REPEATED_THRESHOLD.HIGH}번입니다.`
    case 'BED_AREA_ACTIVITY':
      return `${t} 침대 주변 센서에서 움직임이 감지되면 알립니다. 알림이 가장 많아서, 센서의 민감도가 ‘${SENSITIVITY_LABELS.HIGH}’일 때만 만들어집니다.`
  }
}

/** 센서 하나의 민감도가 그 센서의 신호 처리에 미치는 영향 */
export function sensorSensitivityEffect(zone: ZoneKind, level: Sensitivity): string {
  switch (zone) {
    case 'ENTRANCE':
      return '현관 센서는 민감도와 상관없이 야간 움직임마다 알립니다. 반복 움직임 판단 기준만 달라집니다.'
    case 'BED_SIDE':
      return level === 'HIGH'
        ? '이 센서의 움직임마다 ‘침대 주변 움직임’ 알림을 만듭니다.'
        : `‘침대 주변 움직임’ 알림은 만들지 않습니다. (‘${SENSITIVITY_LABELS.HIGH}’일 때만) 이어진 움직임 판단에는 계속 쓰입니다.`
    case 'PATH':
      return level === 'LOW'
        ? '침대 주변 뒤 이어진 움직임 알림을 만들지 않습니다. 반복 움직임 판단에는 쓰입니다.'
        : '침대 주변 신호 뒤에 이어지면 ‘이어진 움직임’ 알림을 만듭니다.'
  }
}
