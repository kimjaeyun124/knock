import {
  REPEATED_THRESHOLD,
  REPEATED_WINDOW_MINUTES,
  SENSITIVITY_LABELS,
  type AlertPreferencesInput,
  type DetectionSettingsInput,
  type Sensitivity,
  type Sensor,
} from '@tetris/shared'
import { ALERT_TYPE_LABELS } from '@/lib/labels'
import { describeWeekdays } from '@/lib/night'

/**
 * 지금 설정에서 "전달되지 않는 알림"을 사람이 읽을 말로 정리한다. (순수 함수)
 * 설정 화면이 이 목록을 보여 주어, 알림을 끈 보호자가 무엇을 놓치게 되는지 알 수 있게 한다.
 *
 * level
 *  - danger : 즉시 확인 권장 알림(현관 근처 움직임)이 전달되지 않는다
 *  - warn   : 일부 알림이 전달되지 않는다
 *  - info   : 알림은 만들어지지만 조건이 좁아진다
 */
export type BlockedLevel = 'danger' | 'warn' | 'info'

export interface BlockedItem {
  id: string
  level: BlockedLevel
  /** 한 문장 요약 */
  title: string
  /** 무엇이 전달되지 않는지, 그래도 남는 것은 무엇인지 */
  detail: string
}

const LEVEL_ORDER: Record<BlockedLevel, number> = { danger: 0, warn: 1, info: 2 }

type Inputs = {
  detection: Pick<
    DetectionSettingsInput,
    'monitoringEnabled' | 'activeWeekdays' | 'sensitivity' | 'cooldownMinutes'
  >
  prefs: AlertPreferencesInput
  sensors: readonly Pick<Sensor, 'zone' | 'isActive' | 'sensitivity' | 'name'>[]
}

const MOVEMENT_TYPES = [
  ['entranceApproach', 'ENTRANCE_APPROACH'],
  ['bedToPath', 'BED_TO_PATH'],
  ['repeatedMovement', 'REPEATED_MOVEMENT'],
  ['bedAreaActivity', 'BED_AREA_ACTIVITY'],
] as const

export function describeBlockedAlerts(input: Inputs): BlockedItem[] {
  const { detection, prefs, sensors } = input
  const items: BlockedItem[] = []
  const KEPT = '움직임은 움직임 기록에 그대로 남습니다.'

  // ── 모니터링 전체 ─────────────────────────────
  if (!detection.monitoringEnabled) {
    items.push({
      id: 'monitoring-off',
      level: 'danger',
      title: '모니터링이 꺼져 있어 움직임 알림이 모두 만들어지지 않습니다',
      detail: `현관 근처 움직임(즉시 확인 권장)을 포함해 침대 주변·이동 경로·반복 움직임 알림이 전달되지 않습니다. ${KEPT} 센서 연결·배터리 알림은 따로 설정합니다.`,
    })
  } else if (detection.activeWeekdays.length < 7) {
    const off = [0, 1, 2, 3, 4, 5, 6].filter((day) => !detection.activeWeekdays.includes(day))
    items.push({
      id: 'weekdays',
      level: off.length >= 4 ? 'danger' : 'warn',
      title: `${describeWeekdays(off)}에 시작하는 밤에는 움직임 알림이 만들어지지 않습니다`,
      detail: `선택하지 않은 요일의 밤(야간 시간이 시작되는 날 기준)에는 현관 근처 움직임을 포함한 모든 움직임 알림이 전달되지 않습니다. ${KEPT}`,
    })
  }

  // ── 알림 종류별 끔 ────────────────────────────
  if (detection.monitoringEnabled) {
    for (const [key, type] of MOVEMENT_TYPES) {
      if (prefs[key]) continue
      const urgent = type === 'ENTRANCE_APPROACH'
      items.push({
        id: `pref-${key}`,
        level: urgent ? 'danger' : 'warn',
        title: `‘${ALERT_TYPE_LABELS[type]}’ 알림이 전달되지 않습니다`,
        detail: `${urgent ? '즉시 확인 권장 수준의 알림이라, 끄면 밤에 현관 쪽으로 움직여도 알림이 오지 않습니다. ' : ''}${KEPT}`,
      })
    }
  }

  // ── 센서 알림 ─────────────────────────────────
  if (!prefs.sensorIssues) {
    items.push({
      id: 'sensor-issues',
      level: 'warn',
      title: '센서 연결 끊김·복구 알림이 전달되지 않습니다',
      detail:
        '센서가 꺼지거나 신호가 끊겨도 알림이 오지 않아, 움직임을 받지 못하는 상태를 알아채지 못할 수 있습니다. 연결 상태는 센서 화면과 대시보드에 계속 표시됩니다.',
    })
  }
  if (!prefs.lowBattery) {
    items.push({
      id: 'low-battery',
      level: 'warn',
      title: '배터리 부족 알림이 전달되지 않습니다',
      detail:
        '배터리가 떨어져 센서가 멈추기 전에 알림을 받지 못합니다. 배터리 상태는 센서 화면에 계속 표시됩니다.',
    })
  }

  // ── 알림이 만들어질 수 없는 구조 ──────────────
  const active = sensors.filter((sensor) => sensor.isActive)
  if (detection.monitoringEnabled && prefs.entranceApproach && sensors.length > 0) {
    const entrance = active.some((sensor) => sensor.zone === 'ENTRANCE')
    if (!entrance) {
      items.push({
        id: 'no-entrance-sensor',
        level: 'warn',
        title: '사용 중인 현관 센서가 없어 현관 근처 움직임 알림이 만들어질 수 없습니다',
        detail: '현관 구역에 센서를 등록하고 사용으로 켜 두어야 이 알림이 만들어집니다.',
      })
    }
  }

  // ── 민감도로 좁아지는 알림 ────────────────────
  if (detection.monitoringEnabled) {
    const level = (sensor: Pick<Sensor, 'sensitivity'>): Sensitivity =>
      sensor.sensitivity ?? detection.sensitivity
    const beds = active.filter((sensor) => sensor.zone === 'BED_SIDE')
    const paths = active.filter((sensor) => sensor.zone === 'PATH')
    if (prefs.bedAreaActivity && beds.length > 0 && beds.every((s) => level(s) !== 'HIGH')) {
      items.push({
        id: 'bed-needs-high',
        level: 'info',
        title: '침대 주변 움직임 알림은 지금 만들어지지 않습니다',
        detail: `이 알림은 침대 센서의 민감도가 ‘${SENSITIVITY_LABELS.HIGH}’일 때만 만들어집니다. 지금은 ${SENSITIVITY_LABELS[level(beds[0] ?? { sensitivity: null })]}입니다.`,
      })
    }
    if (prefs.bedToPath && paths.length > 0 && paths.every((s) => level(s) === 'LOW')) {
      items.push({
        id: 'path-low',
        level: 'info',
        title: '침대 주변에서 이동 경로로 이어진 움직임 알림은 지금 만들어지지 않습니다',
        detail: `이동 경로 센서의 민감도가 ‘${SENSITIVITY_LABELS.LOW}’이면 이 알림은 만들어지지 않습니다. ‘${SENSITIVITY_LABELS.MEDIUM}’ 이상으로 올려 주세요.`,
      })
    }
    if (prefs.repeatedMovement && detection.sensitivity === 'LOW') {
      items.push({
        id: 'repeated-low',
        level: 'info',
        title: `반복 움직임 알림은 ${REPEATED_WINDOW_MINUTES}분 안에 구역이 ${REPEATED_THRESHOLD.LOW}번 이상 바뀔 때만 만들어집니다`,
        detail: `민감도 ‘${SENSITIVITY_LABELS.LOW}’ 기준입니다. ‘${SENSITIVITY_LABELS.MEDIUM}’은 ${REPEATED_THRESHOLD.MEDIUM}번입니다.`,
      })
    }
  }

  // ── 중복 알림 간격 ────────────────────────────
  if (detection.cooldownMinutes >= 60) {
    items.push({
      id: 'cooldown',
      level: 'info',
      title: `같은 종류의 알림은 ${detection.cooldownMinutes}분 동안 새로 만들어지지 않습니다`,
      detail:
        '이 시간 안에 같은 종류의 신호가 또 감지되어도 새 알림 대신 이미 있는 알림에 합쳐집니다. 간격이 길수록 새 상황을 늦게 알게 될 수 있습니다.',
    })
  }

  return items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

/** 즉시 확인 권장 알림이 전달되지 않는 위험 수준의 항목만 */
export function dangerItems(items: readonly BlockedItem[]): BlockedItem[] {
  return items.filter((item) => item.level === 'danger')
}
