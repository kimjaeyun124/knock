import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  BatteryLevel,
  DataOrigin,
  DeliveryStatus,
  DeliveryDisplayState,
  ProviderMode,
  Resolution,
  TimelineAttention,
  TimelineEventType,
} from '@tetris/shared'

// 화면에 보이는 문구. 확정적·의학적 표현을 쓰지 않는다. (labels.test.ts 가 금지 표현을 검사한다)

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  INFO: '참고',
  NOTICE: '확인 필요',
  URGENT: '즉시 확인 권장',
}

export const BATTERY_LABELS: Record<BatteryLevel, string> = {
  UNKNOWN: '배터리 정보 없음',
  OK: '배터리 충분',
  LOW: '배터리 부족',
  CRITICAL: '배터리 위급',
}

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
  REAL: '실제 센서',
  SIMULATED: '시뮬레이션',
}

/** Mock(샘플 데이터)으로 동작 중인 화면에 붙이는 문구 */
export const SAMPLE_DATA_LABEL = '샘플 데이터'
export const SAMPLE_DATA_NOTICE = '일부 화면이 샘플 데이터입니다'

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  BED_AREA_ACTIVITY: '침대 주변 움직임',
  BED_TO_PATH: '침대 주변에서 이동 경로로 이어진 움직임',
  ENTRANCE_APPROACH: '현관 근처 움직임',
  REPEATED_MOVEMENT: '짧은 시간 안의 반복된 움직임',
  SENSOR_OFFLINE: '센서 연결 끊김',
  SENSOR_RESTORED: '센서 연결 복구',
  LOW_BATTERY: '센서 배터리 부족',
  DELIVERY_FAILED: '알림 전달 실패',
}

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: '진행 중',
  ACKNOWLEDGED: '확인함',
  RESOLVED: '종료',
}

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  CHECKED: '확인함',
  FALSE_ALARM: '잘못된 알림',
  AUTO_RESOLVED: '자동 종료',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: '전달 대기',
  SENT: '전달됨',
  FAILED: '전달 실패',
  NOT_CONFIGURED: '연동되지 않음',
  CANCELLED: '전달 중단',
}

export const PROVIDER_MODE_LABELS: Record<ProviderMode, string> = {
  REAL: '실제 연동',
  MOCK: '가짜 응답',
}

/**
 * 움직임 기록의 이벤트 유형 이름. 침대 주변·현관 관련 유형은 센서 위치와 규칙에 따른 "추정"이라고 이름에 밝힌다.
 * (단일 움직임 센서의 신호로 낙상이나 외출을 확정하지 않는다)
 */
export const TIMELINE_TYPE_LABELS: Record<TimelineEventType, string> = {
  BED_EXIT_CANDIDATE: '침대 주변 움직임 (추정)',
  MOTION_DETECTED: '일반 움직임',
  ENTRANCE_ACTIVITY: '현관 주변 움직임 (추정)',
  SENSOR_OFFLINE: '센서 연결 끊김',
  SENSOR_RESTORED: '센서 연결 복구',
  LOW_BATTERY: '배터리 부족',
}

/** 움직임 기록의 주의 수준. 알림 심각도와 같은 이름을 쓰고, 알림과 무관한 기록은 "일반"이다. */
export const TIMELINE_ATTENTION_LABELS: Record<TimelineAttention, string> = {
  NORMAL: '일반',
  INFO: SEVERITY_LABELS.INFO,
  NOTICE: SEVERITY_LABELS.NOTICE,
  URGENT: SEVERITY_LABELS.URGENT,
}

/**
 * 알림 전달 상태(화면용). 서버가 알 수 있는 범위에서만 구분한다.
 * 푸시·문자처럼 기기에 도착했는지 확인할 수 없는 채널을 "전송 성공"이라고 쓰지 않는다.
 */
export const DELIVERY_DISPLAY_LABELS: Record<DeliveryDisplayState, string> = {
  WAITING: '대기',
  ATTEMPTING: '전송 시도',
  SENT: '전송 성공',
  UNVERIFIED: '전달 확인 불가',
  FAILED: '전송 실패',
}

/** 전달 상태가 무엇을 뜻하고 무엇을 뜻하지 않는지 */
export const DELIVERY_DISPLAY_HINTS: Record<DeliveryDisplayState, string> = {
  WAITING: '아직 보내지 않았습니다.',
  ATTEMPTING: '보내 보았고 다시 시도할 예정입니다.',
  SENT: '열려 있는 앱 화면에 보냈습니다. 보호자가 읽었다는 뜻은 아닙니다.',
  UNVERIFIED:
    '푸시 서비스 등 외부 서비스에 넘겼습니다. 실제 기기에 도착했는지는 확인할 수 없습니다.',
  FAILED: '모든 시도가 실패했습니다.',
}
