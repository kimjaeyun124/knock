import { describe, expect, it } from 'vitest'
import {
  addDaysToKey,
  formatLocalDateTime,
  formatLocalDayHeading,
  formatLocalTime,
  isValidDateKey,
  localDateKey,
  localDayEnd,
  localDayStart,
  localTimeZone,
} from './localTime'

// 테스트는 TZ=Asia/Seoul 로 돌린다. (vite.config.ts) 그래야 로컬 시간이 항상 같다.
describe('로컬 시간 (기기 시간대)', () => {
  it('테스트 시간대는 Asia/Seoul 이다', () => {
    expect(localTimeZone()).toBe('Asia/Seoul')
  })

  it('UTC 로 받은 ISO 시각을 로컬 시간으로 보여 준다', () => {
    expect(formatLocalTime('2026-11-13T15:05:00.000Z')).toBe('오전 12:05') // 한국 다음 날 0시 5분
    expect(formatLocalDateTime('2026-11-13T15:05:00.000Z')).toBe('11월 14일 오전 12:05')
  })

  it('날짜 구분은 UTC 가 아니라 로컬 날짜 기준이다', () => {
    expect(localDateKey('2026-11-13T14:59:59.000Z')).toBe('2026-11-13')
    expect(localDateKey('2026-11-13T15:00:00.000Z')).toBe('2026-11-14')
  })

  it('로컬 하루의 시작과 끝을 ISO(UTC)로 돌려준다', () => {
    expect(localDayStart('2026-11-14')).toBe('2026-11-13T15:00:00.000Z')
    expect(localDayEnd('2026-11-14')).toBe('2026-11-14T14:59:59.999Z')
  })

  it('올바르지 않은 날짜는 null 이다', () => {
    expect(localDayStart('2026-02-30')).toBeNull()
    expect(localDayEnd('어제')).toBeNull()
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-11-14')).toBe(true)
  })

  it('날짜 계산은 월·연 경계를 넘는다', () => {
    expect(addDaysToKey('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('날짜 머리글은 요일을 포함한다', () => {
    expect(formatLocalDayHeading('2026-11-17')).toBe('2026년 11월 17일 화요일')
  })
})
