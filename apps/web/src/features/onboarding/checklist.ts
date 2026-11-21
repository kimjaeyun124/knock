import type { AlertPreferencesInput, Sensor } from '@tetris/shared'

export type ChecklistTone = 'blocking' | 'warn' | 'info'

export interface ChecklistItem {
  id: string
  tone: ChecklistTone
  /** 무엇이 아직인지 */
  text: string
  /** 고치러 갈 단계 */
  step: number
}

export type PushSummary = 'registered' | 'not-registered' | 'unavailable'

/**
 * 설정 확인 단계의 "미완료 항목". 저장된 값을 기준으로 만든다.
 * - blocking: 이것이 없으면 설정을 완료할 수 없다.
 * - warn: 완료할 수는 있지만 모니터링에 영향이 있다.
 * - info: 선택 사항이다.
 */
export function buildChecklist(input: {
  alias: string | null
  sensors: readonly Sensor[]
  prefs: AlertPreferencesInput
  push: PushSummary
}): ChecklistItem[] {
  const items: ChecklistItem[] = []
  const { sensors, prefs } = input

  if (!input.alias?.trim()) {
    items.push({
      id: 'alias',
      tone: 'blocking',
      text: '보호 대상의 호칭을 입력해 주세요.',
      step: 2,
    })
  }

  const active = sensors.filter((s) => s.isActive)
  if (sensors.length === 0) {
    items.push({
      id: 'no-sensor',
      tone: 'warn',
      text: '등록한 센서가 없습니다. 센서를 등록하기 전에는 움직임을 받을 수 없어 모니터링되지 않습니다.',
      step: 3,
    })
  } else if (active.length === 0) {
    items.push({
      id: 'no-active-sensor',
      tone: 'warn',
      text: '사용 중인 센서가 없습니다. 센서를 켜기 전에는 모니터링되지 않습니다.',
      step: 3,
    })
  } else {
    const connected = active.filter((s) => s.lastSeenAt !== null)
    if (connected.length === 0) {
      items.push({
        id: 'no-signal',
        tone: 'warn',
        text: '아직 첫 신호를 받은 센서가 없습니다. 센서가 연결될 때까지 움직임을 받을 수 없습니다.',
        step: 3,
      })
    } else if (connected.length < active.length) {
      items.push({
        id: 'some-no-signal',
        tone: 'warn',
        text: `센서 ${active.length - connected.length}개가 아직 첫 신호를 보내지 않았습니다.`,
        step: 3,
      })
    }
    if (active.every((s) => s.origin === 'SIMULATED')) {
      items.push({
        id: 'simulated-only',
        tone: 'info',
        text: '시뮬레이션 센서만 있습니다. 실제 움직임은 감지되지 않으며, 화면 확인용입니다.',
        step: 3,
      })
    }
  }

  const movementOff =
    !prefs.bedAreaActivity && !prefs.bedToPath && !prefs.entranceApproach && !prefs.repeatedMovement
  if (movementOff && !prefs.sensorIssues && !prefs.lowBattery) {
    items.push({
      id: 'all-alerts-off',
      tone: 'warn',
      text: '움직임과 센서 이상 알림을 모두 껐습니다. 알림이 오지 않고 화면에서만 확인할 수 있습니다.',
      step: 5,
    })
  } else if (movementOff) {
    items.push({
      id: 'movement-alerts-off',
      tone: 'warn',
      text: '움직임 알림을 모두 껐습니다. 움직임은 기록되지만 알림은 오지 않습니다.',
      step: 5,
    })
  }

  if (input.push === 'not-registered') {
    items.push({
      id: 'push',
      tone: 'info',
      text: '이 기기에서 브라우저 알림을 받도록 등록하지 않았습니다. 앱 화면이 열려 있을 때만 알림이 보입니다.',
      step: 5,
    })
  }
  return items
}

export function hasBlocking(items: readonly ChecklistItem[]): boolean {
  return items.some((item) => item.tone === 'blocking')
}
