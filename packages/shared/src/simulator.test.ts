import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from './copy'
import {
  SCENARIOS,
  ScenarioSchema,
  findScenario,
  scenarioDurationSeconds,
  SimulatorRunRequestSchema,
} from './simulator'

describe('시뮬레이터 시나리오', () => {
  it('계획서의 6종이 있고 id 가 겹치지 않는다', () => {
    expect(SCENARIOS).toHaveLength(6)
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(6)
  })

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    '%s 은(는) 스키마를 따르고 시간 순서가 맞다',
    (_id, scenario) => {
      expect(ScenarioSchema.safeParse(scenario).success).toBe(true)
      const times = scenario.steps.map((step) => step.atSeconds)
      expect(times).toEqual([...times].sort((a, b) => a - b))
    },
  )

  it('문구에 확정적 표현이 없다', () => {
    const text = SCENARIOS.flatMap((s) => [s.title, s.description, s.expectation]).join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
  })

  it('조회와 길이 계산', () => {
    expect(findScenario('entrance')?.title).toBe('현관 근처 움직임')
    expect(findScenario('nope')).toBeUndefined()
    expect(scenarioDurationSeconds(findScenario('bed-to-path')!)).toBe(120)
  })

  it('배속은 1·10·60 만 받고 기본값은 1이다', () => {
    expect(SimulatorRunRequestSchema.parse({}).speed).toBe(1)
    expect(SimulatorRunRequestSchema.safeParse({ speed: 5 }).success).toBe(false)
  })
})
