import type { AlertItem, MovementEvent, Sensor, TimelineEvent } from '@tetris/shared'

// 가상의 테스트 데이터. 실제 사람이나 기기와 관계없다.

export function makeSensor(overrides: Partial<Sensor> = {}): Sensor {
  return {
    id: 's1',
    name: '침대 옆 센서(테스트)',
    kind: 'MOTION',
    zone: 'BED_SIDE',
    origin: 'REAL',
    isActive: true,
    state: 'ONLINE',
    lastSeenAt: '2026-11-13T15:00:00.000Z',
    batteryPercent: 80,
    batteryLevel: 'OK',
    firmwareVersion: null,
    deviceId: null,
    lastHeartbeatAt: null,
    offlineAfterSeconds: null,
    effectiveOfflineAfterSeconds: 300,
    silentSeconds: 0,
    longSilent: false,
    receiveErrors: { count: 0, lastAt: null, lastReason: null },
    sensitivity: null,
    hardwareSensitivitySupported: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

/** 알림 목록·상세가 돌려주는 알림(읽음 여부 포함). 기본은 읽지 않음이다. */
export function makeAlert(overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    id: 'a1',
    type: 'ENTRANCE_APPROACH',
    severity: 'URGENT',
    status: 'OPEN',
    origin: 'REAL',
    title: '현관 근처에서 움직임이 감지되었습니다',
    message: '야간 시간대에 현관 구역 센서가 움직임을 감지했습니다.',
    sensorId: 's1',
    sensorName: '현관 센서(테스트)',
    triggeredAt: '2026-11-13T15:10:00.000Z',
    lastEventAt: '2026-11-13T15:10:00.000Z',
    occurrences: 1,
    acknowledgedAt: null,
    acknowledgedByName: null,
    resolvedAt: null,
    resolution: null,
    note: null,
    reminderCount: 0,
    delivery: { sent: 0, pending: 0, failed: 0, notConfigured: 3 },
    deliveryState: null,
    relatedEventIds: [],
    read: false,
    ...overrides,
  }
}

export function makeEvent(overrides: Partial<MovementEvent> = {}): MovementEvent {
  return {
    id: 'e1',
    sensorId: 's1',
    sensorName: '침대 옆 센서(테스트)',
    zone: 'BED_SIDE',
    origin: 'REAL',
    occurredAt: '2026-11-13T15:00:00.000Z',
    receivedAt: '2026-11-13T15:00:01.000Z',
    isLate: false,
    ...overrides,
  }
}

export const DETECTION_SETTINGS = {
  monitoringEnabled: true,
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  nightStart: '22:00',
  nightEnd: '06:00',
  sensitivity: 'MEDIUM',
  sequenceWindowMinutes: 10,
  cooldownMinutes: 10,
  reminderMinutes: 5,
  offlineAfterSeconds: 300,
  lowBatteryPercent: 20,
  criticalBatteryPercent: 10,
  retentionDays: 90,
  updatedAt: '2026-11-13T00:00:00.000Z',
}

export const ALERT_PREFERENCES = {
  bedAreaActivity: true,
  bedToPath: true,
  entranceApproach: true,
  repeatedMovement: true,
  sensorIssues: true,
  lowBattery: true,
  updatedAt: '2026-11-13T00:00:00.000Z',
}

export const HOUSEHOLD = {
  id: 'h1',
  name: '데모 가구',
  recipientAlias: '어르신(데모)',
  recipientMemo: null,
  onboardingStep: 1,
  setupCompleted: false,
  setupCompletedAt: null,
}

export function makeSimulatorState(overrides: Record<string, unknown> = {}) {
  const zones = ['BED_SIDE', 'PATH', 'ENTRANCE'] as const
  return {
    sensors: zones.map((zone, index) => ({
      zone,
      sensor: makeSensor({
        id: `sim${index}`,
        zone,
        origin: 'SIMULATED',
        name: `시뮬레이션 ${zone}`,
      }),
      silenced: false,
      batteryPercent: 90,
    })),
    recent: [],
    running: null,
    lastRun: null,
    deliveryFailure: { enabled: false, expiresAt: null },
    night: { start: '22:00', end: '06:00', isNightNow: true, sensitivity: 'MEDIUM' },
    ...overrides,
  }
}

/** 움직임 기록(타임라인)의 이벤트. 기본은 알림과 무관한 일반 움직임이다. */
export function makeTimelineEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'mov_e1',
    sensorId: 's1',
    sensorName: '침대 옆 센서(테스트)',
    eventType: 'MOTION_DETECTED',
    zone: 'BED_SIDE',
    origin: 'REAL',
    occurredAt: '2026-11-13T15:05:00.000Z',
    receivedAt: '2026-11-13T15:05:01.000Z',
    isLate: false,
    attention: 'NORMAL',
    alertRaised: false,
    alerts: [],
    description: '침대 주변 센서(침대 옆 센서(테스트))에서 움직임 신호가 있었습니다.',
    rule: {
      alertType: null,
      text: '이 신호 하나는 알림 규칙에 해당하지 않아 기록으로만 남습니다.',
    },
    ...overrides,
  }
}

export const TIMELINE_SUMMARY = {
  total: 0,
  attention: 0,
  alertRaised: 0,
  lastEventAt: null,
  generatedAt: '2026-11-17T00:00:00.000Z',
}
