import { describe, expect, it } from 'vitest'
import { makeSensor } from '@/test/fixtures'
import { buildChecklist, hasBlocking } from './checklist'
import {
  SUGGESTED_NIGHT,
  crossesMidnight,
  describeDuration,
  durationMinutes,
  validateSchedule,
} from './schedule'
import { parseStep, resolveStep } from './steps'

const PREFS = {
  bedAreaActivity: true,
  bedToPath: true,
  entranceApproach: true,
  repeatedMovement: true,
  sensorIssues: true,
  lowBattery: true,
}

const ids = (items: { id: string }[]) => items.map((i) => i.id)

describe('미완료 항목', () => {
  const base = {
    alias: '어르신',
    sensors: [makeSensor()],
    prefs: PREFS,
    push: 'registered',
  } as const

  it('모두 갖추면 비어 있다', () => {
    expect(buildChecklist(base)).toEqual([])
  })

  it('호칭이 없으면 완료를 막는 필수 항목이다', () => {
    const items = buildChecklist({ ...base, alias: '  ' })
    expect(ids(items)).toEqual(['alias'])
    expect(hasBlocking(items)).toBe(true)
  })

  it('센서가 없으면 모니터링되지 않는다는 경고지만 완료를 막지는 않는다', () => {
    const items = buildChecklist({ ...base, sensors: [] })
    expect(ids(items)).toEqual(['no-sensor'])
    expect(items[0]?.text).toContain('모니터링되지 않습니다')
    expect(hasBlocking(items)).toBe(false)
  })

  it('첫 신호를 받은 센서가 없으면 연결된 것으로 치지 않는다', () => {
    expect(ids(buildChecklist({ ...base, sensors: [makeSensor({ lastSeenAt: null })] }))).toEqual([
      'no-signal',
    ])
    expect(
      ids(
        buildChecklist({
          ...base,
          sensors: [makeSensor(), makeSensor({ id: 's2', lastSeenAt: null })],
        }),
      ),
    ).toEqual(['some-no-signal'])
  })

  it('꺼진 센서만 있으면 사용 중인 센서가 없다고 알린다', () => {
    expect(ids(buildChecklist({ ...base, sensors: [makeSensor({ isActive: false })] }))).toEqual([
      'no-active-sensor',
    ])
  })

  it('시뮬레이션 센서만 있으면 실제 감지가 아니라고 알린다', () => {
    const items = buildChecklist({ ...base, sensors: [makeSensor({ origin: 'SIMULATED' })] })
    expect(ids(items)).toEqual(['simulated-only'])
    expect(items[0]?.tone).toBe('info')
  })

  it('움직임 알림을 모두 끄면 경고하고, 센서 이상까지 끄면 더 강하게 알린다', () => {
    const off = { ...PREFS, bedAreaActivity: false, bedToPath: false, entranceApproach: false }
    expect(ids(buildChecklist({ ...base, prefs: { ...off, repeatedMovement: false } }))).toEqual([
      'movement-alerts-off',
    ])
    expect(
      ids(
        buildChecklist({
          ...base,
          prefs: { ...off, repeatedMovement: false, sensorIssues: false, lowBattery: false },
        }),
      ),
    ).toEqual(['all-alerts-off'])
    expect(ids(buildChecklist({ ...base, prefs: { ...PREFS, bedAreaActivity: false } }))).toEqual(
      [],
    )
  })

  it('이 기기가 푸시에 등록되지 않았다면 선택 항목으로 알리고, 서버가 지원하지 않으면 알리지 않는다', () => {
    const items = buildChecklist({ ...base, push: 'not-registered' })
    expect(items.map((i) => [i.id, i.tone])).toEqual([['push', 'info']])
    expect(buildChecklist({ ...base, push: 'unavailable' })).toEqual([])
  })
})

describe('모니터링 시간 검사', () => {
  it('제안 시간은 밤 10시~아침 6시다', () => {
    expect(SUGGESTED_NIGHT).toEqual({ start: '22:00', end: '06:00' })
    expect(validateSchedule('22:00', '06:00')).toEqual({})
  })

  it('비어 있거나 같거나 형식이 틀리면 오류다', () => {
    expect(validateSchedule('', '06:00').nightStart).toContain('입력')
    expect(validateSchedule('22:00', '').nightEnd).toContain('입력')
    expect(validateSchedule('22:00', '22:00').nightEnd).toBe('시작과 종료 시각은 달라야 합니다.')
    expect(validateSchedule('25:00', '06:00').nightStart).toContain('형식')
  })

  it('길이와 자정 넘김을 계산한다', () => {
    expect(durationMinutes('22:00', '06:00')).toBe(480)
    expect(durationMinutes('09:00', '17:30')).toBe(510)
    expect(crossesMidnight('22:00', '06:00')).toBe(true)
    expect(crossesMidnight('09:00', '17:30')).toBe(false)
    expect(describeDuration(480)).toBe('8시간')
    expect(describeDuration(510)).toBe('8시간 30분')
    expect(describeDuration(45)).toBe('45분')
  })
})

describe('단계 결정', () => {
  it('주소의 단계는 1~6 의 정수만 받는다', () => {
    expect(parseStep('3')).toBe(3)
    for (const bad of [null, '', '0', '7', '-1', '2.5', 'abc']) expect(parseStep(bad)).toBeNull()
  })

  it('도달하지 않은 단계로는 건너뛸 수 없고, 주소가 없으면 저장된 단계에서 이어 한다', () => {
    expect(resolveStep(null, 4)).toBe(4)
    expect(resolveStep(2, 4)).toBe(2)
    expect(resolveStep(6, 3)).toBe(3)
  })
})
