import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES, LATE_NOTE, type Sensitivity, type ZoneKind } from '@tetris/shared'
import {
  REPEATED_MIN_GAP_SECONDS,
  REPEATED_THRESHOLD,
  countZoneTransitions,
  evaluateMovementRules,
  mergeCandidates,
  type MovementRuleSettings,
} from './movement-rules'
import type { AlertCandidate, RuleEvent } from './types'

/** 한국 시각 2026-11-15 02:00 (야간) */
const NIGHT = Date.parse('2026-11-14T17:00:00Z')
/** 한국 시각 2026-11-15 13:00 (낮) */
const DAY = Date.parse('2026-11-15T04:00:00Z')

let n = 0
function ev(
  zone: ZoneKind,
  minutes: number,
  opts: { base?: number; late?: boolean; sensor?: string } = {},
): RuleEvent {
  n += 1
  return {
    id: `e${String(n).padStart(3, '0')}`,
    sensorId: `s-${zone}`,
    sensorName: opts.sensor ?? `${zone} 센서`,
    zone,
    occurredAt: new Date((opts.base ?? NIGHT) + minutes * 60_000),
    isLate: opts.late ?? false,
  }
}

const settings = (
  sensitivity: Sensitivity = 'MEDIUM',
  extra: Partial<MovementRuleSettings> = {},
): MovementRuleSettings => ({
  monitoringEnabled: true,
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  nightStart: '22:00',
  nightEnd: '06:00',
  sensitivity,
  sequenceWindowMinutes: 10,
  ...extra,
})

/** 새 이벤트 목록을 그대로 "최근 이벤트"로도 넘긴다. */
function run(
  events: RuleEvent[],
  sens: Sensitivity = 'MEDIUM',
  extra: Partial<MovementRuleSettings> = {},
  newOnly?: RuleEvent[],
): AlertCandidate[] {
  return evaluateMovementRules({
    newEvents: newOnly ?? events,
    recentEvents: events,
    settings: settings(sens, extra),
    origin: 'REAL',
  })
}
const types = (list: AlertCandidate[]) => list.map((c) => c.type).sort()

describe('ENTRANCE_APPROACH (현관)', () => {
  it.each(['LOW', 'MEDIUM', 'HIGH'] as const)(
    '야간 현관 신호는 민감도 %s 에서도 긴급 알림이다',
    (s) => {
      const result = run([ev('ENTRANCE', 0, { sensor: '현관문' })], s)
      const entrance = result.find((c) => c.type === 'ENTRANCE_APPROACH')
      expect(entrance).toMatchObject({
        severity: 'URGENT',
        mode: 'EVENT',
        dedupeKey: 'ENTRANCE_APPROACH:s-ENTRANCE',
      })
      expect(entrance?.message).toContain('현관문')
    },
  )

  it('낮에는 알리지 않는다 (움직임은 기록만)', () => {
    expect(run([ev('ENTRANCE', 0, { base: DAY })])).toEqual([])
  })

  it('발생 시각 기준으로 야간을 판단한다 (낮에 발생해 밤에 도착한 신호는 알리지 않음)', () => {
    expect(run([ev('ENTRANCE', 0, { base: DAY, late: true })])).toEqual([])
  })
})

describe('BED_AREA_ACTIVITY (침대 주변)', () => {
  it('민감도 높음에서만 침대 주변 신호 하나로 알린다', () => {
    expect(types(run([ev('BED_SIDE', 0)], 'HIGH'))).toEqual(['BED_AREA_ACTIVITY'])
    expect(run([ev('BED_SIDE', 0)], 'MEDIUM')).toEqual([])
    expect(run([ev('BED_SIDE', 0)], 'LOW')).toEqual([])
  })

  it('주의(NOTICE) 수준이다', () => {
    expect(run([ev('BED_SIDE', 0)], 'HIGH')[0]?.severity).toBe('NOTICE')
  })

  it('낮에는 알리지 않는다', () => {
    expect(run([ev('BED_SIDE', 0, { base: DAY })], 'HIGH')).toEqual([])
  })
})

describe('BED_TO_PATH (침대 주변 → 이동 경로)', () => {
  it('침대 주변 신호 뒤 시간 창 안에 이동 경로 신호가 오면 알린다 (보통 이상)', () => {
    const bed = ev('BED_SIDE', 0)
    const path = ev('PATH', 4)
    for (const s of ['MEDIUM', 'HIGH'] as const) {
      const found = run([bed, path], s).find((c) => c.type === 'BED_TO_PATH')
      expect(found, s).toMatchObject({ severity: 'NOTICE', evidenceEventIds: [bed.id, path.id] })
      expect(found?.message).toContain('4분 안에')
    }
  })

  it('민감도 낮음에서는 알리지 않는다', () => {
    expect(run([ev('BED_SIDE', 0), ev('PATH', 4)], 'LOW')).toEqual([])
  })

  it('시간 창(기본 10분)을 넘기면 알리지 않고, 경계(정확히 10분)는 알린다', () => {
    expect(types(run([ev('BED_SIDE', 0), ev('PATH', 11)]))).toEqual([])
    expect(types(run([ev('BED_SIDE', 0), ev('PATH', 10)]))).toEqual(['BED_TO_PATH'])
  })

  it('시간 창은 설정(sequenceWindowMinutes)을 따른다', () => {
    const events = [ev('BED_SIDE', 0), ev('PATH', 4)]
    expect(types(run(events, 'MEDIUM', { sequenceWindowMinutes: 3 }))).toEqual([])
    expect(types(run(events, 'MEDIUM', { sequenceWindowMinutes: 5 }))).toEqual(['BED_TO_PATH'])
  })

  it('순서가 반대(이동 경로 → 침대 주변)면 알리지 않는다', () => {
    expect(run([ev('PATH', 0), ev('BED_SIDE', 2)])).toEqual([])
  })

  it('이동 경로 신호만 있으면 알리지 않는다', () => {
    expect(run([ev('PATH', 0)])).toEqual([])
  })

  it('침대 주변 신호가 이미 저장되어 있고 이동 경로 신호만 새로 와도 알린다', () => {
    const bed = ev('BED_SIDE', 0)
    const path = ev('PATH', 3)
    const result = run([bed, path], 'MEDIUM', {}, [path])
    expect(types(result)).toEqual(['BED_TO_PATH'])
  })

  it('가장 가까운 직전 침대 주변 신호를 근거로 삼는다', () => {
    const old = ev('BED_SIDE', 0)
    const near = ev('BED_SIDE', 8)
    const path = ev('PATH', 9)
    const found = run([old, near, path]).find((c) => c.type === 'BED_TO_PATH')
    expect(found?.evidenceEventIds).toEqual([near.id, path.id])
  })
})

describe('REPEATED_MOVEMENT (짧은 시간 안에 여러 구역)', () => {
  const zigzag = (count: number): RuleEvent[] =>
    Array.from({ length: count + 1 }, (_, i) => ev(i % 2 === 0 ? 'PATH' : 'BED_SIDE', i * 3))

  it.each([
    ['LOW', 6],
    ['MEDIUM', 4],
    ['HIGH', 3],
  ] as const)(
    '민감도 %s: 구역이 %i번 바뀌면 알리고, 하나 모자라면 알리지 않는다',
    (s, threshold) => {
      expect(REPEATED_THRESHOLD[s]).toBe(threshold)
      const enough = run(zigzag(threshold), s).filter((c) => c.type === 'REPEATED_MOVEMENT')
      expect(enough, `${threshold}회`).toHaveLength(1)
      const notEnough = run(zigzag(threshold - 1), s).filter((c) => c.type === 'REPEATED_MOVEMENT')
      expect(notEnough, `${threshold - 1}회`).toHaveLength(0)
    },
  )

  it('같은 구역에서 신호가 반복되는 것은 구역 변경으로 세지 않는다', () => {
    const sameZone = Array.from({ length: 12 }, (_, i) => ev('PATH', i))
    expect(run(sameZone, 'HIGH')).toEqual([])
  })

  it('30분이 지난 신호는 세지 않는다', () => {
    const events = [
      ev('PATH', 0),
      ev('BED_SIDE', 10),
      ev('PATH', 20),
      ev('BED_SIDE', 40),
      ev('PATH', 50),
    ]
    // 50분 시점 기준 30분 창(20~50)에는 PATH, BED_SIDE, PATH 가 있어 변경 2번
    expect(run(events, 'MEDIUM').filter((c) => c.type === 'REPEATED_MOVEMENT')).toEqual([])
  })

  it('근거는 시간 창 안의 모든 신호이고, 문구에 횟수가 들어간다', () => {
    const events = zigzag(4)
    const found = run(events, 'MEDIUM').find((c) => c.type === 'REPEATED_MOVEMENT')
    expect(found?.evidenceEventIds).toEqual(events.map((e) => e.id))
    expect(found?.message).toContain('30분 안에 구역이 4번')
  })

  it('낮에는 알리지 않는다', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      ev(i % 2 ? 'BED_SIDE' : 'PATH', i * 2, { base: DAY }),
    )
    expect(run(events, 'HIGH')).toEqual([])
  })
})

describe('시나리오 (계획서 9.3)', () => {
  it('정상 야간: 침대 → 이동 경로 → 침대 한 번은 보통 민감도에서 이동 흐름만 알린다', () => {
    const events = [ev('BED_SIDE', 0), ev('PATH', 2), ev('BED_SIDE', 9)]
    expect(types(run(events, 'MEDIUM'))).toEqual(['BED_TO_PATH'])
    // 민감도 낮음이면 아무 알림도 없다
    expect(run(events, 'LOW')).toEqual([])
  })

  it('현관 접근: 침대 → 이동 경로 → 현관 이면 이동 흐름(주의)과 현관(긴급)이 함께 나온다', () => {
    const events = [ev('BED_SIDE', 0), ev('PATH', 2), ev('ENTRANCE', 4)]
    expect(types(run(events, 'MEDIUM'))).toEqual(['BED_TO_PATH', 'ENTRANCE_APPROACH'])
  })
})

describe('여러 신호가 한꺼번에 들어올 때', () => {
  it('같은 종류의 알림은 하나로 합쳐지고 근거 신호가 모두 담긴다', () => {
    const a = ev('ENTRANCE', 0)
    const b = ev('ENTRANCE', 1)
    const c = ev('ENTRANCE', 2)
    const entrance = run([a, b, c]).filter((x) => x.type === 'ENTRANCE_APPROACH')
    expect(entrance).toHaveLength(1)
    expect(entrance[0]?.evidenceEventIds).toEqual([a.id, b.id, c.id])
    expect(entrance[0]?.triggeredAt).toEqual(a.occurredAt)
    expect(entrance[0]?.lastEventAt).toEqual(c.occurredAt)
  })

  it('입력 순서가 뒤섞여 있어도 발생 시각 순으로 판단한다', () => {
    const bed = ev('BED_SIDE', 0)
    const path = ev('PATH', 3)
    const shuffled = run([path, bed])
    expect(types(shuffled)).toEqual(['BED_TO_PATH'])
  })
})

describe('지연 수신', () => {
  it('근거 신호 중 늦게 도착한 것이 있으면 문구로 알린다', () => {
    const found = run([ev('ENTRANCE', 0, { late: true })])[0]
    expect(found?.message.endsWith(LATE_NOTE)).toBe(true)
  })

  it('늦게 도착하지 않았으면 덧붙이지 않는다', () => {
    expect(run([ev('ENTRANCE', 0)])[0]?.message).not.toContain('늦게 도착')
  })
})

describe('문구 원칙', () => {
  it('어떤 규칙의 문구도 확정적·의학적 표현을 쓰지 않는다', () => {
    const events = [
      ev('BED_SIDE', 0),
      ev('PATH', 2),
      ev('ENTRANCE', 4),
      ev('PATH', 6),
      ev('BED_SIDE', 8),
      ev('PATH', 10),
    ]
    const all = run(events, 'HIGH', {}, events)
    expect(all.length).toBeGreaterThanOrEqual(4)
    for (const c of all) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(c.title + c.message, c.type).not.toContain(phrase)
      }
    }
  })
})

describe('mergeCandidates', () => {
  const base: AlertCandidate = {
    type: 'LOW_BATTERY',
    severity: 'INFO',
    origin: 'REAL',
    dedupeKey: 'k',
    title: 't1',
    message: 'm1',
    sensorId: 's',
    triggeredAt: new Date(1000),
    lastEventAt: new Date(1000),
    evidenceEventIds: ['a'],
    mode: 'EVENT',
  }

  it('더 높은 심각도의 문구를 남기고, 시각은 가장 이른/늦은 값으로 합친다', () => {
    const [merged] = mergeCandidates([
      base,
      {
        ...base,
        severity: 'URGENT',
        title: 't2',
        triggeredAt: new Date(2000),
        lastEventAt: new Date(3000),
        evidenceEventIds: ['b'],
      },
      {
        ...base,
        severity: 'NOTICE',
        title: 't3',
        triggeredAt: new Date(500),
        lastEventAt: new Date(500),
        evidenceEventIds: ['a', 'c'],
      },
    ])
    expect(merged).toMatchObject({ severity: 'URGENT', title: 't2' })
    expect(merged?.triggeredAt.getTime()).toBe(500)
    expect(merged?.lastEventAt.getTime()).toBe(3000)
    expect(merged?.evidenceEventIds).toEqual(['a', 'b', 'c'])
  })

  it('종류가 다르면 합치지 않는다', () => {
    expect(mergeCandidates([base, { ...base, dedupeKey: 'other' }])).toHaveLength(2)
  })
})

describe('설정이 판단에 반영된다 (모니터링 사용 여부·요일·센서별 민감도)', () => {
  it('모니터링을 끄면 야간 현관 신호에도 알림 후보가 없다', () => {
    expect(run([ev('ENTRANCE', 0)], 'MEDIUM', { monitoringEnabled: false })).toEqual([])
  })

  it('NIGHT 는 토요일 밤(일요일 새벽 02:00)이다: 일정에 토요일이 없으면 판단하지 않고, 있으면 판단한다', () => {
    const without = [0, 1, 2, 3, 4, 6] // 토(5) 제외
    expect(run([ev('ENTRANCE', 0)], 'MEDIUM', { activeWeekdays: without })).toEqual([])
    expect(types(run([ev('ENTRANCE', 0)], 'MEDIUM', { activeWeekdays: [5] }))).toEqual([
      'ENTRANCE_APPROACH',
    ])
  })

  it('센서에 정한 민감도가 가구 기본보다 우선한다: 기본은 낮음이어도 높음으로 정한 침대 센서는 알린다', () => {
    const bed = { ...ev('BED_SIDE', 0), sensitivity: 'HIGH' as const }
    expect(run([bed], 'LOW')).toHaveLength(1)
    expect(run([ev('BED_SIDE', 0)], 'LOW')).toEqual([])
  })

  it('반대로 기본은 높음이어도 낮음으로 정한 침대 센서는 알리지 않는다', () => {
    const bed = { ...ev('BED_SIDE', 0), sensitivity: 'LOW' as const }
    expect(run([bed], 'HIGH')).toEqual([])
  })

  it('이동 경로 센서의 민감도가 낮음이면 침대 주변 뒤 이어진 움직임도 알리지 않는다', () => {
    const path = { ...ev('PATH', 5), sensitivity: 'LOW' as const }
    expect(types(run([ev('BED_SIDE', 0), path], 'MEDIUM'))).toEqual([])
    expect(types(run([ev('BED_SIDE', 0), ev('PATH', 5)], 'MEDIUM'))).toEqual(['BED_TO_PATH'])
  })
})

/** 몇 초 뒤 */
const sec = (n: number): number => n / 60
const disabled = (event: RuleEvent): RuleEvent => ({ ...event, sensorEnabled: false })
/** 한국 시각 2026-11-15 21:50 — 22:00 에 야간이 시작된다 */
const BEFORE_NIGHT = Date.parse('2026-11-15T12:50:00Z')

describe('인식 정확도 개선 — 겹치는 감지 범위 잡음(전환 간격)', () => {
  it('직전 신호와 최소 간격(초) 안에서 번갈아 반응하는 것은 이동으로 세지 않는다', () => {
    const bounce = [
      ev('BED_SIDE', 0),
      ev('PATH', sec(3)),
      ev('BED_SIDE', sec(5)),
      ev('PATH', sec(7)),
      ev('BED_SIDE', sec(9)),
    ]
    expect(countZoneTransitions(bounce)).toBe(0)
  })

  it('간격이 충분히 벌어진 전환은 모두 센다 (시뮬레이터 시나리오는 30초 간격)', () => {
    const walk = [0, 30, 60, 90, 120].map((s, i) => ev(i % 2 === 0 ? 'BED_SIDE' : 'PATH', sec(s)))
    expect(countZoneTransitions(walk)).toBe(4)
    expect(REPEATED_MIN_GAP_SECONDS).toBeLessThan(30)
  })

  it('경계: 정확히 최소 간격만큼 떨어지면 센다 (바로 못 미치면 세지 않는다)', () => {
    const at = (gap: number) => [ev('BED_SIDE', 0), ev('PATH', sec(gap))]
    expect(countZoneTransitions(at(REPEATED_MIN_GAP_SECONDS))).toBe(1)
    expect(countZoneTransitions(at(REPEATED_MIN_GAP_SECONDS - 1))).toBe(0)
  })

  it('같은 구역이 이어지거나 신호가 없으면 0 이다', () => {
    expect(countZoneTransitions([])).toBe(0)
    expect(countZoneTransitions([ev('PATH', 0), ev('PATH', 1), ev('PATH', 2)])).toBe(0)
  })

  it('두 센서가 몇 초 사이로 번갈아 반응해도 "여러 구역 움직임" 알림을 만들지 않는다 (민감도 높음에서도)', () => {
    const noise = Array.from({ length: 12 }, (_, i) =>
      ev(i % 2 === 0 ? 'BED_SIDE' : 'PATH', sec(i * 3)),
    )
    const out = run(noise, 'HIGH')
    expect(types(out)).not.toContain('REPEATED_MOVEMENT')
  })

  it('실제로 오간 움직임(간격 30초)은 그대로 알린다', () => {
    const walk = [0, 30, 60, 90, 120].map((s, i) => ev(i % 2 === 0 ? 'BED_SIDE' : 'PATH', sec(s)))
    expect(types(run(walk, 'MEDIUM'))).toContain('REPEATED_MOVEMENT')
  })
})

describe('인식 정확도 개선 — 흐름 판단에 쓰는 신호만 쓴다', () => {
  it('꺼 둔 센서의 신호는 침대→이동 경로 판단에 쓰지 않는다', () => {
    const bed = disabled(ev('BED_SIDE', 0))
    const path = ev('PATH', 2)
    expect(types(run([bed, path], 'MEDIUM', {}, [path]))).not.toContain('BED_TO_PATH')
    // 같은 신호를 켜 두었다면 알린다 (대조)
    expect(types(run([ev('BED_SIDE', 0), ev('PATH', 2)], 'MEDIUM', {}, undefined))).toContain(
      'BED_TO_PATH',
    )
  })

  it('꺼 둔 센서의 신호는 구역 전환 횟수에 세지 않는다', () => {
    const list = [
      ev('BED_SIDE', 0),
      disabled(ev('PATH', 1)),
      ev('BED_SIDE', 2),
      disabled(ev('PATH', 3)),
      ev('BED_SIDE', 4),
      disabled(ev('PATH', 5)),
      ev('BED_SIDE', 6),
    ]
    expect(types(run(list, 'HIGH'))).not.toContain('REPEATED_MOVEMENT')
  })

  it('야간이 시작되기 전(모니터링 시간 밖)의 신호는 이동·전환 판단에 섞이지 않는다', () => {
    // 21:55 침대, 22:00 직후 이동 경로 — 야간에 든 신호는 이동 경로뿐이다
    const bed = ev('BED_SIDE', 5, { base: BEFORE_NIGHT })
    const path = ev('PATH', 11, { base: BEFORE_NIGHT })
    expect(types(run([bed, path], 'MEDIUM', {}, [path]))).not.toContain('BED_TO_PATH')

    const before = [
      ev('BED_SIDE', 1, { base: BEFORE_NIGHT }),
      ev('PATH', 3, { base: BEFORE_NIGHT }),
      ev('BED_SIDE', 5, { base: BEFORE_NIGHT }),
      ev('PATH', 7, { base: BEFORE_NIGHT }),
      ev('BED_SIDE', 9, { base: BEFORE_NIGHT }),
    ]
    const first = ev('PATH', 12, { base: BEFORE_NIGHT })
    expect(types(run([...before, first], 'HIGH', {}, [first]))).not.toContain('REPEATED_MOVEMENT')
  })

  it('모니터링 시간 안의 신호끼리는 지금처럼 이어서 판단한다 (대조)', () => {
    const bed = ev('BED_SIDE', 12, { base: BEFORE_NIGHT })
    const path = ev('PATH', 14, { base: BEFORE_NIGHT })
    expect(types(run([bed, path], 'MEDIUM', {}, [path]))).toContain('BED_TO_PATH')
  })
})

describe('인식 정확도 개선 — 현관 신호에 직전 움직임 흐름을 덧붙인다', () => {
  const entranceOf = (list: AlertCandidate[]) => list.find((c) => c.type === 'ENTRANCE_APPROACH')

  it('직전 시간 창 안에 침대 주변·이동 경로 신호가 있으면 문구와 근거에 담고, 심각도는 그대로 긴급이다', () => {
    const bed = ev('BED_SIDE', 0)
    const path = ev('PATH', 3)
    const door = ev('ENTRANCE', 6)
    const found = entranceOf(run([bed, path, door], 'MEDIUM', {}, [door]))
    expect(found?.severity).toBe('URGENT')
    expect(found?.message).toContain(
      '직전 10분 안에 침대 주변·이동 경로 구역에서도 움직임 신호가 있었습니다',
    )
    expect(found?.evidenceEventIds).toEqual([bed.id, path.id, door.id])
  })

  it('이동 경로만 있었다면 그 구역만 말한다', () => {
    const path = ev('PATH', 4)
    const door = ev('ENTRANCE', 6)
    const found = entranceOf(run([path, door], 'MEDIUM', {}, [door]))
    expect(found?.message).toContain('직전 10분 안에 이동 경로 구역에서도')
    expect(found?.message).not.toContain('침대 주변')
  })

  it('시간 창 밖이거나 꺼 둔 센서의 신호는 덧붙이지 않는다', () => {
    const old = ev('PATH', 0)
    const off = disabled(ev('BED_SIDE', 20))
    const door = ev('ENTRANCE', 25)
    const found = entranceOf(run([old, off, door], 'MEDIUM', {}, [door]))
    expect(found?.message).not.toContain('직전')
    expect(found?.evidenceEventIds).toEqual([door.id])
  })

  it('현관 신호만 있으면 지금까지와 같은 문구다', () => {
    const door = ev('ENTRANCE', 0)
    const found = entranceOf(run([door], 'LOW'))
    expect(found?.message).toBe(
      `야간 시간대에 현관 센서(${door.sensorName})에서 움직임 신호가 있었습니다. 확인해 주세요.`,
    )
  })

  it('덧붙인 문구도 단정적 표현을 쓰지 않는다', () => {
    const list = [ev('BED_SIDE', 0), ev('PATH', 2), ev('ENTRANCE', 4)]
    const found = entranceOf(run(list, 'HIGH', {}, [list[2] as RuleEvent]))
    for (const word of FORBIDDEN_PHRASES) {
      expect(found?.title).not.toContain(word)
      expect(found?.message).not.toContain(word)
    }
    expect(found?.message).not.toMatch(/외출|나갔|나가/)
  })
})
