import type {
  AlertSeverity,
  AlertType,
  DataOrigin,
  Sensitivity,
  SensorState,
  ZoneKind,
} from '@tetris/shared'

/** 규칙 엔진이 보는 움직임 이벤트 (DB 모델과 분리된 순수 값) */
export interface RuleEvent {
  id: string
  sensorId: string
  sensorName: string
  zone: ZoneKind
  occurredAt: Date
  isLate: boolean
  /** 이 센서에만 정한 민감도. 없으면(null/생략) 가구 기본 민감도를 따른다. */
  sensitivity?: Sensitivity | null
  /** 센서를 사용으로 켜 두었는가. 생략하면 켜져 있는 것으로 본다. */
  sensorEnabled?: boolean
  /** 이 신호를 받기 직전의 센서 연결 상태 */
  connection?: SensorState
}

/**
 * 규칙이 "이런 알림을 만들어야 한다"고 판단한 결과. 저장·전달은 AlertService 가 맡는다.
 *
 * mode
 * - EVENT: 움직임 신호에서 생긴다. 같은 종류가 반복 억제 시간(cooldown) 안에 다시 생기면 합쳐진다.
 * - CONDITION: "지금 이런 상태다"에서 생긴다(연결 끊김·배터리). 상태가 풀릴 때까지 알림 하나만 유지한다.
 */
export interface AlertCandidate {
  type: AlertType
  severity: AlertSeverity
  origin: DataOrigin
  dedupeKey: string
  title: string
  message: string
  sensorId: string | null
  triggeredAt: Date
  lastEventAt: Date
  evidenceEventIds: string[]
  mode: 'EVENT' | 'CONDITION'
  /**
   * true 면 만들 때부터 종료(자동 종료) 상태다. 알려 주기만 하면 되는 정보(예: 센서 연결 복구)에 쓴다.
   * 종료되어 있어도 읽음 여부는 따로 관리되므로 "읽지 않음"으로 목록에 올라온다.
   */
  resolved?: boolean
}
