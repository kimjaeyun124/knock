import { describe, expect, it } from 'vitest'
import { isMonitoredTime, isNightTime, minutesOfDayKst, parseTimeOfDay, weekdayKst } from './time'

/** 한국 시각 문자열을 UTC Date 로 만든다. (예: kst('2026-11-15 02:00')) */
const kst = (text: string) => new Date(`${text.replace(' ', 'T')}:00+09:00`)

describe('minutesOfDayKst', () => {
  it('UTC 를 한국 시각(+9)으로 바꿔 자정부터의 분을 돌려준다', () => {
    expect(minutesOfDayKst(new Date('2026-11-14T15:00:00Z'))).toBe(0) // 한국 자정
    expect(minutesOfDayKst(new Date('2026-11-14T13:30:00Z'))).toBe(22 * 60 + 30)
    expect(minutesOfDayKst(new Date('2026-11-14T14:59:00Z'))).toBe(23 * 60 + 59)
  })
})

describe('parseTimeOfDay', () => {
  it('HH:mm 을 분으로 바꾸고 형식이 틀리면 예외', () => {
    expect(parseTimeOfDay('06:05')).toBe(365)
    expect(() => parseTimeOfDay('24:00')).toThrow()
    expect(() => parseTimeOfDay('6:00')).toThrow()
  })
})

describe('isNightTime — 자정을 넘는 구간 (22:00–06:00)', () => {
  const night = (text: string) => isNightTime(kst(text), '22:00', '06:00')

  it('시작 시각은 포함한다', () => {
    expect(night('2026-11-14 21:59')).toBe(false)
    expect(night('2026-11-14 22:00')).toBe(true)
  })

  it('자정 전후 모두 야간이다', () => {
    expect(night('2026-11-14 23:59')).toBe(true)
    expect(night('2026-11-15 00:00')).toBe(true)
    expect(night('2026-11-15 03:30')).toBe(true)
  })

  it('종료 시각은 포함하지 않는다', () => {
    expect(night('2026-11-15 05:59')).toBe(true)
    expect(night('2026-11-15 06:00')).toBe(false)
  })

  it('낮 시간은 야간이 아니다', () => {
    expect(night('2026-11-15 12:00')).toBe(false)
    expect(night('2026-11-15 18:00')).toBe(false)
  })

  it('서버가 UTC 로 동작해도 한국 시각 기준으로 판단한다', () => {
    // UTC 17:00 = 한국 02:00 (야간), UTC 03:00 = 한국 12:00 (낮)
    expect(isNightTime(new Date('2026-11-14T17:00:00Z'), '22:00', '06:00')).toBe(true)
    expect(isNightTime(new Date('2026-11-14T03:00:00Z'), '22:00', '06:00')).toBe(false)
  })
})

describe('isNightTime — 같은 날 구간 (01:00–05:00)', () => {
  it('구간 안만 야간이다', () => {
    expect(isNightTime(kst('2026-11-15 00:59'), '01:00', '05:00')).toBe(false)
    expect(isNightTime(kst('2026-11-15 01:00'), '01:00', '05:00')).toBe(true)
    expect(isNightTime(kst('2026-11-15 04:59'), '01:00', '05:00')).toBe(true)
    expect(isNightTime(kst('2026-11-15 05:00'), '01:00', '05:00')).toBe(false)
    expect(isNightTime(kst('2026-11-15 23:00'), '01:00', '05:00')).toBe(false)
  })

  it('시작과 종료가 같으면 야간이 없는 것으로 본다', () => {
    expect(isNightTime(kst('2026-11-15 03:00'), '03:00', '03:00')).toBe(false)
  })
})

describe('weekdayKst', () => {
  it('한국 시각 기준으로 월=0 … 일=6 을 돌려준다', () => {
    expect(weekdayKst(kst('2026-11-16 12:00'))).toBe(0) // 월
    expect(weekdayKst(kst('2026-11-15 12:00'))).toBe(6) // 일
    // UTC 로는 아직 일요일이지만 한국은 월요일 00:30
    expect(weekdayKst(new Date('2026-11-15T15:30:00Z'))).toBe(0)
  })
})

describe('isMonitoredTime — 모니터링 사용 여부와 요일 일정', () => {
  const base = { nightStart: '22:00', nightEnd: '06:00' }
  const all = [0, 1, 2, 3, 4, 5, 6]
  const mon = { ...base, monitoringEnabled: true, activeWeekdays: [0] }

  it('모니터링을 끄면 야간이어도 판단하지 않는다', () => {
    const off = { ...base, monitoringEnabled: false, activeWeekdays: all }
    expect(isMonitoredTime(kst('2026-11-16 23:00'), off)).toBe(false)
  })

  it('야간이 아니면 요일과 상관없이 판단하지 않는다', () => {
    expect(
      isMonitoredTime(kst('2026-11-16 13:00'), {
        ...base,
        monitoringEnabled: true,
        activeWeekdays: all,
      }),
    ).toBe(false)
  })

  it('자정을 넘는 구간은 시작된 날의 일정이다: 월요일만 켜면 월요일 밤과 화요일 새벽만 해당한다', () => {
    expect(isMonitoredTime(kst('2026-11-16 23:00'), mon)).toBe(true) // 월 밤
    expect(isMonitoredTime(kst('2026-11-17 03:00'), mon)).toBe(true) // 화 새벽 = 월요일 밤의 일부
    expect(isMonitoredTime(kst('2026-11-16 03:00'), mon)).toBe(false) // 월 새벽 = 일요일 밤
    expect(isMonitoredTime(kst('2026-11-17 23:00'), mon)).toBe(false) // 화 밤
  })

  it('같은 날 안에서 끝나는 구간은 그날 일정이다', () => {
    const day = {
      monitoringEnabled: true,
      activeWeekdays: [1],
      nightStart: '09:00',
      nightEnd: '17:00',
    }
    expect(isMonitoredTime(kst('2026-11-17 10:00'), day)).toBe(true) // 화
    expect(isMonitoredTime(kst('2026-11-16 10:00'), day)).toBe(false) // 월
  })
})
