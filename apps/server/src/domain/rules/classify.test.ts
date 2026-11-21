import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { classifyMovementEvent, type ClassificationInput } from './classify'

/** 한국 시각 문자열 → Date. 2026-11-16 은 월요일 */
const kst = (text: string) => new Date(`${text.replace(' ', 'T')}:00+09:00`)

const schedule = {
  monitoringEnabled: true,
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  nightStart: '22:00',
  nightEnd: '06:00',
}
const base = (over: Partial<ClassificationInput> & { at: string }): ClassificationInput => ({
  zone: 'BED_SIDE',
  occurredAt: kst(over.at),
  schedule,
  sensorEnabled: true,
  ...over,
})

describe('움직임 분류 (RULE 1~3)', () => {
  it('RULE 1: 야간 모니터링 시간의 침대 주변 신호는 BED_EXIT_CANDIDATE (확정이 아닌 추정)', () => {
    const result = classifyMovementEvent(base({ at: '2026-11-16 23:30', zone: 'BED_SIDE' }))
    expect(result).toMatchObject({ eventClass: 'BED_EXIT_CANDIDATE', alertEligible: true })
  })

  it('RULE 2: 야간 모니터링 시간의 현관 신호는 ENTRANCE_ACTIVITY', () => {
    const result = classifyMovementEvent(base({ at: '2026-11-16 23:30', zone: 'ENTRANCE' }))
    expect(result).toMatchObject({ eventClass: 'ENTRANCE_ACTIVITY', alertEligible: true })
  })

  it('RULE 3: 이동 경로 신호는 야간이어도 일반 움직임으로 기록한다', () => {
    const result = classifyMovementEvent(base({ at: '2026-11-16 23:30', zone: 'PATH' }))
    expect(result.eventClass).toBe('MOTION_DETECTED')
  })

  it('낮에는 침대 주변·현관 신호도 일반 움직임이고 알림 후보가 아니다', () => {
    for (const zone of ['BED_SIDE', 'ENTRANCE'] as const) {
      expect(classifyMovementEvent(base({ at: '2026-11-16 13:00', zone }))).toMatchObject({
        eventClass: 'MOTION_DETECTED',
        alertEligible: false,
        ineligibleReason: 'NOT_MONITORED_TIME',
      })
    }
  })

  it('자정을 지나는 일정(22:00~06:00): 자정 전후 모두 같은 야간이고, 시작은 포함·종료는 제외한다', () => {
    const at = (t: string) => classifyMovementEvent(base({ at: t })).eventClass
    expect(at('2026-11-16 21:59')).toBe('MOTION_DETECTED')
    expect(at('2026-11-16 22:00')).toBe('BED_EXIT_CANDIDATE')
    expect(at('2026-11-16 23:59')).toBe('BED_EXIT_CANDIDATE')
    expect(at('2026-11-17 00:00')).toBe('BED_EXIT_CANDIDATE')
    expect(at('2026-11-17 05:59')).toBe('BED_EXIT_CANDIDATE')
    expect(at('2026-11-17 06:00')).toBe('MOTION_DETECTED')
  })

  it('자정 이후의 신호는 야간이 "시작된 날"의 일정을 따른다 (월요일만 켜면 화요일 새벽 3시는 포함, 월요일 새벽 3시는 제외)', () => {
    const mon = { ...schedule, activeWeekdays: [0] }
    const at = (t: string) => classifyMovementEvent(base({ at: t, schedule: mon })).eventClass
    expect(at('2026-11-16 23:00')).toBe('BED_EXIT_CANDIDATE') // 월 밤
    expect(at('2026-11-17 03:00')).toBe('BED_EXIT_CANDIDATE') // 화 새벽 = 월요일 밤
    expect(at('2026-11-16 03:00')).toBe('MOTION_DETECTED') // 월 새벽 = 일요일 밤
  })

  it('모니터링을 끄면 야간이어도 일반 움직임이고 알림 후보가 아니다', () => {
    const off = { ...schedule, monitoringEnabled: false }
    expect(classifyMovementEvent(base({ at: '2026-11-16 23:30', schedule: off }))).toMatchObject({
      eventClass: 'MOTION_DETECTED',
      alertEligible: false,
    })
  })

  it('꺼 둔(비활성) 센서의 신호는 분류는 되지만 알림 후보가 아니다', () => {
    expect(
      classifyMovementEvent(
        base({ at: '2026-11-16 23:30', zone: 'ENTRANCE', sensorEnabled: false }),
      ),
    ).toMatchObject({
      eventClass: 'ENTRANCE_ACTIVITY',
      alertEligible: false,
      ineligibleReason: 'SENSOR_DISABLED',
    })
  })

  it('연결이 끊겨 있다가 돌아온 센서의 신호에는 주의 사항이 붙고, 분류·알림 후보 여부는 그대로다', () => {
    const result = classifyMovementEvent(
      base({ at: '2026-11-16 23:30', zone: 'ENTRANCE', connection: 'OFFLINE' }),
    )
    expect(result).toMatchObject({ eventClass: 'ENTRANCE_ACTIVITY', alertEligible: true })
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toContain('기록되지 않았을 수 있습니다')
    expect(
      classifyMovementEvent(base({ at: '2026-11-16 23:30', connection: 'ONLINE' })).notes,
    ).toEqual([])
  })

  it('같은 입력과 설정이면 언제나 같은 결과다 (순수 함수)', () => {
    const input = base({ at: '2026-11-16 23:30', zone: 'ENTRANCE' })
    expect(classifyMovementEvent(input)).toEqual(classifyMovementEvent({ ...input }))
  })

  it('안내 문구에 확정적 표현이 없다', () => {
    const text = classifyMovementEvent(
      base({ at: '2026-11-16 23:30', connection: 'OFFLINE' }),
    ).notes.join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
  })
})
