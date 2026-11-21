import { describe, expect, it } from 'vitest'
import { makeSensor } from '@/test/fixtures'
import { countSensors, sensorDisplayStatus } from './sensorStatus'

describe('sensorDisplayStatus: 연결과 배터리는 독립이다', () => {
  it('연결 정상 + 배터리 충분 = ONLINE', () => {
    expect(sensorDisplayStatus(makeSensor())).toBe('ONLINE')
  })
  it('연결 정상 + 배터리 부족/위급 = LOW_BATTERY (연결이 정상임을 지우지 않는다)', () => {
    expect(sensorDisplayStatus(makeSensor({ batteryLevel: 'LOW' }))).toBe('LOW_BATTERY')
    expect(sensorDisplayStatus(makeSensor({ batteryLevel: 'CRITICAL' }))).toBe('LOW_BATTERY')
  })
  it('배터리 정보가 없어도 연결이 정상이면 ONLINE 이다 (없는 값을 부족으로 만들지 않는다)', () => {
    expect(sensorDisplayStatus(makeSensor({ batteryLevel: 'UNKNOWN', batteryPercent: null }))).toBe(
      'ONLINE',
    )
  })
  it('연결이 끊기면 배터리와 상관없이 OFFLINE 이다', () => {
    expect(sensorDisplayStatus(makeSensor({ state: 'OFFLINE', batteryLevel: 'OK' }))).toBe(
      'OFFLINE',
    )
    expect(sensorDisplayStatus(makeSensor({ state: 'OFFLINE', batteryLevel: 'LOW' }))).toBe(
      'OFFLINE',
    )
  })
  it('첫 신호 전은 UNKNOWN, 꺼 둔 센서는 DISABLED 이다', () => {
    expect(sensorDisplayStatus(makeSensor({ state: 'PENDING', lastSeenAt: null }))).toBe('UNKNOWN')
    expect(sensorDisplayStatus(makeSensor({ state: 'DISABLED', isActive: false }))).toBe('DISABLED')
  })
})

describe('countSensors', () => {
  it('사용 중·연결·정상 작동 수를 따로 센다', () => {
    const counts = countSensors([
      makeSensor({ id: 'a' }),
      makeSensor({ id: 'b', batteryLevel: 'LOW' }),
      makeSensor({ id: 'c', state: 'OFFLINE' }),
      makeSensor({ id: 'd', state: 'PENDING' }),
      makeSensor({ id: 'e', isActive: false, state: 'DISABLED' }),
    ])
    expect(counts).toEqual({ total: 5, active: 4, connected: 2, working: 1 })
  })
  it('센서가 없으면 모두 0이다', () => {
    expect(countSensors([])).toEqual({ total: 0, active: 0, connected: 0, working: 0 })
  })
})
