import { describe, expect, it } from 'vitest'
import { REPEATED_THRESHOLD, REPEATED_WINDOW_MINUTES } from '@tetris/shared'
import { ruleSummary, sensorSensitivityEffect } from './rules'

const settings = {
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  nightStart: '22:00',
  nightEnd: '06:00',
  sequenceWindowMinutes: 12,
}

describe('이벤트 판단 규칙 문장', () => {
  it('현재 설정 값(시간·요일·판단 시간)이 문장에 들어간다', () => {
    const text = ruleSummary('BED_TO_PATH', { ...settings, activeWeekdays: [0, 2, 4] })
    expect(text).toContain('월·수·금 밤(22:00~06:00)')
    expect(text).toContain('12분 안에')
  })

  it('반복 움직임 기준은 서버 규칙과 같은 상수를 쓴다', () => {
    const text = ruleSummary('REPEATED_MOVEMENT', settings)
    expect(text).toContain(`${REPEATED_WINDOW_MINUTES}분 안에`)
    expect(text).toContain(`‘낮음’ ${REPEATED_THRESHOLD.LOW}번`)
    expect(text).toContain(`‘높음’ ${REPEATED_THRESHOLD.HIGH}번`)
  })

  it('침대 주변 움직임은 민감도 높음일 때만이라고 밝힌다', () => {
    expect(ruleSummary('BED_AREA_ACTIVITY', settings)).toContain('‘높음’일 때만')
  })
})

describe('센서별 민감도의 영향', () => {
  it('구역마다 서버 규칙과 같은 결과를 설명한다', () => {
    expect(sensorSensitivityEffect('BED_SIDE', 'HIGH')).toContain('알림을 만듭니다')
    expect(sensorSensitivityEffect('BED_SIDE', 'MEDIUM')).toContain('만들지 않습니다')
    expect(sensorSensitivityEffect('PATH', 'LOW')).toContain('만들지 않습니다')
    expect(sensorSensitivityEffect('PATH', 'MEDIUM')).toContain('만듭니다')
    expect(sensorSensitivityEffect('ENTRANCE', 'LOW')).toContain('민감도와 상관없이')
  })
})
