import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { batteryCandidate, deliveryFailedCandidate, offlineCandidate } from './sensor-rules'

const now = new Date('2026-11-14T03:00:00Z')
const sensor = { id: 's1', name: '안방 침대 옆', zone: 'BED_SIDE', origin: 'REAL' } as const

describe('offlineCandidate', () => {
  it('그 구역의 유일한 센서면 긴급, 다른 센서가 있으면 주의', () => {
    expect(
      offlineCandidate({ sensor, silentSeconds: 420, soleSensorInZone: true, now }).severity,
    ).toBe('URGENT')
    expect(
      offlineCandidate({ sensor, silentSeconds: 420, soleSensorInZone: false, now }).severity,
    ).toBe('NOTICE')
  })

  it('센서별로 하나의 알림(CONDITION)이고, 문구에 경과 시간과 구역이 들어간다', () => {
    const c = offlineCandidate({ sensor, silentSeconds: 425, soleSensorInZone: true, now })
    expect(c).toMatchObject({
      type: 'SENSOR_OFFLINE',
      dedupeKey: 'SENSOR_OFFLINE:s1',
      mode: 'CONDITION',
      sensorId: 's1',
    })
    expect(c.title).toContain('안방 침대 옆')
    expect(c.message).toContain('7분 이상')
    expect(c.message).toContain('침대 주변')
  })
})

describe('batteryCandidate', () => {
  it('부족은 정보, 위급은 주의 수준이며 같은 센서는 같은 dedupeKey 를 쓴다', () => {
    const low = batteryCandidate({ sensor, percent: 18, level: 'LOW', now })
    const critical = batteryCandidate({ sensor, percent: 6, level: 'CRITICAL', now })
    expect(low.severity).toBe('INFO')
    expect(critical.severity).toBe('NOTICE')
    expect(low.dedupeKey).toBe(critical.dedupeKey)
    expect(critical.title).toContain('6%')
  })
})

describe('deliveryFailedCandidate', () => {
  it('긴급이며 하나의 열린 알림으로 유지된다', () => {
    const c = deliveryFailedCandidate({
      origin: 'REAL',
      failedAlertTitle: '현관 근처에서 움직임이 감지되었습니다',
      now,
    })
    expect(c).toMatchObject({
      severity: 'URGENT',
      dedupeKey: 'DELIVERY_FAILED',
      mode: 'CONDITION',
      sensorId: null,
    })
    expect(c.message).toContain('현관 근처에서 움직임이 감지되었습니다')
  })
})

describe('시스템 알림 문구', () => {
  it('확정적 표현이 없다', () => {
    const texts = [
      offlineCandidate({ sensor, silentSeconds: 600, soleSensorInZone: true, now }),
      batteryCandidate({ sensor, percent: 9, level: 'CRITICAL', now }),
      batteryCandidate({ sensor, percent: 19, level: 'LOW', now }),
      deliveryFailedCandidate({ origin: 'REAL', failedAlertTitle: '제목', now }),
    ].map((c) => c.title + c.message)
    for (const text of texts) for (const p of FORBIDDEN_PHRASES) expect(text).not.toContain(p)
  })
})
