import type { MovementClass, SensorState, ZoneKind } from '@tetris/shared'
import { isMonitoredTime, type MonitoringSchedule } from '../time'

/**
 * 움직임 신호 한 건의 분류와 "알림 후보로 볼 수 있는가"의 판단. 순수 함수 — DB·시계·네트워크를 쓰지 않는다.
 * 같은 입력과 같은 설정이면 항상 같은 결과가 나온다.
 *
 * | 규칙 | 조건 | 분류 |
 * | RULE 1 | 모니터링 시간 + 침대 주변 센서 | BED_EXIT_CANDIDATE — 침대를 벗어났을 "가능성"일 뿐 확정이 아니다 |
 * | RULE 2 | 모니터링 시간 + 현관 센서 | ENTRANCE_ACTIVITY — 현관 쪽 움직임일 뿐 외출·실종을 뜻하지 않는다 |
 * | RULE 3 | 그 밖(이동 경로, 모니터링 시간 밖) | MOTION_DETECTED — 일반 움직임, 기록만 한다 |
 *
 * "모니터링 시간"은 모니터링이 켜져 있고, 설정한 야간 시간대이며, 그 야간이 시작된 요일이 일정에 든 시각이다.
 * (자정을 넘는 구간은 시작된 날의 일정 — domain/time.ts#isMonitoredTime)
 * 시각은 신호가 "발생한" 때를 쓴다. 늦게 도착한 신호도 발생 시각으로 판단한다.
 *
 * 이 분류는 센서 하나의 움직임 신호에 대한 추정이다. 낙상·사고·외출을 판정하지 않으며,
 * 하드웨어와 실험 데이터로 검증되지 않았으므로 정확도(%)나 확률을 표시하지 않는다.
 */

export interface ClassificationInput {
  zone: ZoneKind
  occurredAt: Date
  schedule: MonitoringSchedule
  /** 센서를 "사용"으로 켜 두었는가. 꺼진 센서의 신호는 알림 후보가 되지 않는다. */
  sensorEnabled: boolean
  /** 이 신호를 받기 직전의 센서 연결 상태. 끊겨 있다가 돌아온 센서의 신호에는 주의 사항을 덧붙인다. */
  connection?: SensorState
}

/** 알림 후보에서 빠지는 이유 */
export type IneligibleReason = 'SENSOR_DISABLED' | 'NOT_MONITORED_TIME'

export interface Classification {
  eventClass: MovementClass
  /** 알림을 만들 수 있는 신호인가. false 여도 기록(분류)은 남는다. */
  alertEligible: boolean
  ineligibleReason: IneligibleReason | null
  /** 화면·로그에 덧붙일 설명. 비어 있을 수 있다. */
  notes: string[]
}

export function classifyMovementEvent(input: ClassificationInput): Classification {
  const monitored = isMonitoredTime(input.occurredAt, input.schedule)
  const eventClass: MovementClass = !monitored
    ? 'MOTION_DETECTED'
    : input.zone === 'BED_SIDE'
      ? 'BED_EXIT_CANDIDATE'
      : input.zone === 'ENTRANCE'
        ? 'ENTRANCE_ACTIVITY'
        : 'MOTION_DETECTED'

  const ineligibleReason: IneligibleReason | null = !input.sensorEnabled
    ? 'SENSOR_DISABLED'
    : !monitored
      ? 'NOT_MONITORED_TIME'
      : null

  const notes: string[] = []
  if (input.connection === 'OFFLINE') {
    notes.push(
      '연결이 끊겨 있던 센서에서 온 신호입니다. 끊겨 있던 동안의 움직임은 기록되지 않았을 수 있습니다.',
    )
  }
  return { eventClass, alertEligible: ineligibleReason === null, ineligibleReason, notes }
}
