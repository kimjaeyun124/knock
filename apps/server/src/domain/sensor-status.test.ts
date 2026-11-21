import { describe, expect, it } from 'vitest'
import { deriveBatteryLevel, deriveSensorState } from './sensor-status'

const now = new Date('2026-11-14T03:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)

describe('deriveSensorState', () => {
  const base = { isActive: true, now, offlineAfterSeconds: 300 }

  it('끈 센서는 신호가 있어도 DISABLED', () => {
    expect(deriveSensorState({ ...base, isActive: false, lastSeenAt: ago(1) })).toBe('DISABLED')
  })

  it('신호를 한 번도 받지 못했으면 PENDING (정상으로 보이지 않는다)', () => {
    expect(deriveSensorState({ ...base, lastSeenAt: null })).toBe('PENDING')
  })

  it('기준 시간 이내면 ONLINE, 정확히 기준 시간이어도 ONLINE', () => {
    expect(deriveSensorState({ ...base, lastSeenAt: ago(10) })).toBe('ONLINE')
    expect(deriveSensorState({ ...base, lastSeenAt: ago(300) })).toBe('ONLINE')
  })

  it('기준 시간을 넘기면 OFFLINE', () => {
    expect(deriveSensorState({ ...base, lastSeenAt: ago(301) })).toBe('OFFLINE')
  })

  it('설정한 기준 시간을 따른다', () => {
    expect(deriveSensorState({ ...base, offlineAfterSeconds: 60, lastSeenAt: ago(61) })).toBe(
      'OFFLINE',
    )
  })
})

describe('deriveBatteryLevel', () => {
  const thresholds = { lowBatteryPercent: 20, criticalBatteryPercent: 10 }

  it.each([
    [null, 'UNKNOWN'],
    [100, 'OK'],
    [21, 'OK'],
    [20, 'LOW'],
    [11, 'LOW'],
    [10, 'CRITICAL'],
    [0, 'CRITICAL'],
  ] as const)('%s%% → %s', (percent, expected) => {
    expect(deriveBatteryLevel(percent, thresholds)).toBe(expected)
  })
})
