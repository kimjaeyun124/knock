import { describe, expect, it } from 'vitest'
import { DEFAULT_DETECTION_SETTINGS, FORBIDDEN_PHRASES, TIMELINE_EVENT_TYPES } from '@tetris/shared'
import {
  describeEvent,
  movementAttention,
  ruleFor,
  ruleText,
  statusAlertType,
  statusAttention,
  statusEventType,
} from './timeline'

describe('주의 수준', () => {
  it('움직임 신호는 연결된 알림 중 가장 높은 심각도, 없으면 NORMAL 이다', () => {
    expect(movementAttention([])).toBe('NORMAL')
    expect(movementAttention(['INFO'])).toBe('INFO')
    expect(movementAttention(['NOTICE', 'URGENT', 'INFO'])).toBe('URGENT')
  })
  it('센서 상태 변화: 끊김·위급은 주의, 부족은 참고, 복구는 일반', () => {
    expect(statusAttention('DISCONNECTED')).toBe('NOTICE')
    expect(statusAttention('BATTERY_CRITICAL')).toBe('NOTICE')
    expect(statusAttention('BATTERY_LOW')).toBe('INFO')
    expect(statusAttention('CONNECTED')).toBe('NORMAL')
  })
})

describe('센서 상태 → 이벤트 유형', () => {
  it('끊김·복구·배터리 부족/위급만 기록하고 배터리 회복은 기록하지 않는다', () => {
    expect(statusEventType('DISCONNECTED')).toBe('SENSOR_OFFLINE')
    expect(statusEventType('CONNECTED')).toBe('SENSOR_RESTORED')
    expect(statusEventType('BATTERY_LOW')).toBe('LOW_BATTERY')
    expect(statusEventType('BATTERY_CRITICAL')).toBe('LOW_BATTERY')
    expect(statusEventType('BATTERY_OK')).toBeNull()
  })
  it('알림이 만들어지는 종류만 알림 유형을 가진다', () => {
    expect(statusAlertType('DISCONNECTED')).toBe('SENSOR_OFFLINE')
    expect(statusAlertType('BATTERY_LOW')).toBe('LOW_BATTERY')
    expect(statusAlertType('CONNECTED')).toBe('SENSOR_RESTORED')
    expect(statusAlertType('BATTERY_OK')).toBeNull()
  })
})

describe('설명과 규칙 문구', () => {
  const sample = (type: (typeof TIMELINE_EVENT_TYPES)[number]) =>
    describeEvent({
      type,
      sensorName: '침대 옆',
      zone: type === 'ENTRANCE_ACTIVITY' ? 'ENTRANCE' : 'BED_SIDE',
    })

  it('추정 이벤트는 추정이라고 밝히고 외출·일어남을 확정하지 않는다', () => {
    expect(sample('BED_EXIT_CANDIDATE')).toContain('추정')
    expect(sample('BED_EXIT_CANDIDATE')).toContain('확정하지 않습니다')
    expect(sample('ENTRANCE_ACTIVITY')).toContain('추정')
    expect(sample('ENTRANCE_ACTIVITY')).toContain('밖으로 나갔는지는 알 수 없습니다')
  })

  it('모든 유형의 설명과 규칙 문구에 금지 표현이 없다', () => {
    const texts = [
      ...TIMELINE_EVENT_TYPES.map(sample),
      describeEvent({
        type: 'LOW_BATTERY',
        sensorName: 'x',
        zone: 'PATH',
        critical: true,
        detail: '4%',
      }),
      ...(
        [
          'BED_AREA_ACTIVITY',
          'BED_TO_PATH',
          'ENTRANCE_APPROACH',
          'REPEATED_MOVEMENT',
          'SENSOR_OFFLINE',
          'LOW_BATTERY',
          'DELIVERY_FAILED',
        ] as const
      ).map((type) => ruleText(type, DEFAULT_DETECTION_SETTINGS)),
      ruleFor({ type: 'MOTION_DETECTED', alerts: [], settings: DEFAULT_DETECTION_SETTINGS }).text,
      ruleFor({ type: 'SENSOR_RESTORED', alerts: [], settings: DEFAULT_DETECTION_SETTINGS }).text,
    ].join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(texts).not.toContain(phrase)
  })

  it('규칙 문구는 현재 감지 설정의 값(야간 시간·창·기준)을 담는다', () => {
    const settings = {
      ...DEFAULT_DETECTION_SETTINGS,
      nightStart: '23:00',
      nightEnd: '05:30',
      sequenceWindowMinutes: 7,
    }
    expect(ruleText('BED_TO_PATH', settings)).toContain('23:00~05:30')
    expect(ruleText('BED_TO_PATH', settings)).toContain('7분')
    expect(ruleText('SENSOR_OFFLINE', { ...settings, offlineAfterSeconds: 600 })).toContain('10분')
  })

  it('연결된 알림이 없으면 기록으로만 남는 이유를, 있으면 가장 높은 심각도 알림의 규칙을 쓴다', () => {
    const none = ruleFor({
      type: 'MOTION_DETECTED',
      alerts: [],
      settings: DEFAULT_DETECTION_SETTINGS,
    })
    expect(none.alertType).toBeNull()
    expect(none.text).toContain('기록으로만 남습니다')
    const linked = ruleFor({
      type: 'BED_EXIT_CANDIDATE',
      alerts: [
        { type: 'BED_AREA_ACTIVITY', severity: 'NOTICE' },
        { type: 'REPEATED_MOVEMENT', severity: 'URGENT' },
      ],
      settings: DEFAULT_DETECTION_SETTINGS,
    })
    expect(linked.alertType).toBe('REPEATED_MOVEMENT')
  })
})
