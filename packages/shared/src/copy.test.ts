import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PHRASES,
  alertCopy,
  LATE_NOTE,
  REMINDER_PREFIX,
  ZONE_LABELS,
  ZONE_KINDS,
} from './index'

/** 모든 알림 문구를 여러 입력으로 만들어 본다. */
function allCopies() {
  return [
    alertCopy.entranceApproach('현관문'),
    alertCopy.bedAreaActivity('침대 옆'),
    alertCopy.bedToPath(0),
    alertCopy.bedToPath(95),
    alertCopy.repeatedMovement(4, 30),
    ...ZONE_KINDS.map((zone) => alertCopy.sensorOffline('센서', zone, 7)),
    ...ZONE_KINDS.map((zone) => alertCopy.sensorRestored('센서', zone)),
    alertCopy.lowBattery('센서', 18, false),
    alertCopy.lowBattery('센서', 6, true),
    alertCopy.deliveryFailed('현관 근처에서 움직임이 감지되었습니다'),
  ]
}

describe('알림 문구', () => {
  it('낙상·배회·이탈 같은 확정적·의학적 표현을 쓰지 않는다', () => {
    const texts = [
      ...allCopies().flatMap((c) => [c.title, c.message]),
      LATE_NOTE,
      REMINDER_PREFIX,
      ...Object.values(ZONE_LABELS),
    ]
    for (const text of texts) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(text, `"${phrase}" 이(가) 문구에 있습니다: ${text}`).not.toContain(phrase)
      }
    }
  })

  it('움직임 알림은 "감지되었습니다/신호가 있었습니다 + 확인" 형태로 상황을 단정하지 않는다', () => {
    for (const copy of [
      alertCopy.entranceApproach('a'),
      alertCopy.bedAreaActivity('a'),
      alertCopy.bedToPath(30),
      alertCopy.repeatedMovement(4, 30),
    ]) {
      expect(copy.message).toMatch(/신호가 있었습니다/)
      expect(copy.message).toMatch(/확인해 주세요/)
    }
  })

  it('센서 연결 끊김 문구는 그 구역이 지금 확인되지 않는다는 사실을 알린다', () => {
    const copy = alertCopy.sensorOffline('안방', 'BED_SIDE', 12)
    expect(copy.message).toContain('12분 이상')
    expect(copy.message).toContain('침대 주변')
    expect(copy.message).toContain('확인되지 않습니다')
  })

  it('이동 경로 알림의 시간은 1분 미만이어도 "0분"으로 쓰지 않는다', () => {
    expect(alertCopy.bedToPath(10).message).toContain('1분 안에')
    expect(alertCopy.bedToPath(10).message).not.toContain('0분')
  })
})
