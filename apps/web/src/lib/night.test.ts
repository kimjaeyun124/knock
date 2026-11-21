import { describe, expect, it } from 'vitest'
import { describeSchedule, describeWeekdays, isMonitoredNow, isNightTime } from './night'

// 한국 시간 hh:mm → Date
const kst = (hhmm: string) => new Date(`2026-11-14T${hhmm}:00+09:00`)

describe('isNightTime', () => {
  it('자정을 넘는 구간(22:00~06:00): 시작은 포함, 종료는 제외', () => {
    expect(isNightTime(kst('21:59'), '22:00', '06:00')).toBe(false)
    expect(isNightTime(kst('22:00'), '22:00', '06:00')).toBe(true)
    expect(isNightTime(kst('00:00'), '22:00', '06:00')).toBe(true)
    expect(isNightTime(kst('05:59'), '22:00', '06:00')).toBe(true)
    expect(isNightTime(kst('06:00'), '22:00', '06:00')).toBe(false)
    expect(isNightTime(kst('12:00'), '22:00', '06:00')).toBe(false)
  })
  it('같은 날 안의 구간(01:00~05:00)', () => {
    expect(isNightTime(kst('00:59'), '01:00', '05:00')).toBe(false)
    expect(isNightTime(kst('03:00'), '01:00', '05:00')).toBe(true)
    expect(isNightTime(kst('05:00'), '01:00', '05:00')).toBe(false)
  })
  it('UTC 가 아니라 한국 시간으로 판단한다', () => {
    // UTC 13:00 = 한국 22:00
    expect(isNightTime(new Date('2026-11-14T13:00:00.000Z'), '22:00', '06:00')).toBe(true)
    expect(isNightTime(new Date('2026-11-14T12:59:00.000Z'), '22:00', '06:00')).toBe(false)
  })
})

describe('describeSchedule', () => {
  it('오전·오후로 읽기 쉽게 쓴다', () => {
    expect(describeSchedule('22:00', '06:00')).toBe('매일 오후 10:00 ~ 오전 6:00')
  })
})

describe('isMonitoredNow — 모니터링 사용 여부와 요일 일정 (서버 isMonitoredTime 과 같은 기준)', () => {
  const kst = (text: string) => new Date(`${text.replace(' ', 'T')}:00+09:00`)
  const base = { nightStart: '22:00', nightEnd: '06:00' }
  const mon = { ...base, monitoringEnabled: true, activeWeekdays: [0] }

  it('끄면 야간이어도 아니다', () => {
    const off = { ...base, monitoringEnabled: false, activeWeekdays: [0, 1, 2, 3, 4, 5, 6] }
    expect(isMonitoredNow(kst('2026-11-16 23:00'), off)).toBe(false)
  })

  it('자정을 넘는 구간은 시작된 날의 일정이다', () => {
    expect(isMonitoredNow(kst('2026-11-16 23:00'), mon)).toBe(true) // 월 밤
    expect(isMonitoredNow(kst('2026-11-17 03:00'), mon)).toBe(true) // 화 새벽 = 월요일 밤
    expect(isMonitoredNow(kst('2026-11-16 03:00'), mon)).toBe(false) // 월 새벽 = 일요일 밤
    expect(isMonitoredNow(kst('2026-11-17 23:00'), mon)).toBe(false)
  })
})

describe('describeWeekdays / describeSchedule', () => {
  it('요일 묶음을 읽기 쉬운 말로 바꾼다', () => {
    expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('매일')
    expect(describeWeekdays([4, 3, 2, 1, 0])).toBe('평일(월~금)')
    expect(describeWeekdays([6, 5])).toBe('주말(토·일)')
    expect(describeWeekdays([0, 2, 4])).toBe('월·수·금')
    expect(describeSchedule('22:00', '06:00', [0, 2])).toBe('월·수 오후 10:00 ~ 오전 6:00')
  })
})
