import { describe, expect, it } from 'vitest'
import {
  PASSAGE_MOTION_RULES,
  motionRule,
  PIXEL_DELTA,
  DEFAULT_MOTION_SENSITIVITY,
  DEFAULT_TRIGGER,
  MOTION_MIN_FRAMES,
  MOTION_RATIO_THRESHOLD,
  MotionTrigger,
  changedRatio,
  regionRatios,
  toGray,
} from './motionDetector'

const frame = (values: number[]) => Uint8Array.from(values)

describe('toGray', () => {
  it('RGBA 를 밝기 하나로 바꾼다 (검정 0, 흰색 255 근처, 초록이 가장 밝게)', () => {
    const gray = toGray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255])
    expect(gray[0]).toBe(0)
    expect(gray[1]).toBeGreaterThanOrEqual(254)
    expect(gray[3]).toBeGreaterThan(gray[2]!) // 초록 > 파랑
  })

  it('길이가 4의 배수가 아니면 남는 값은 버린다', () => {
    expect(toGray([1, 2, 3, 255, 9, 9]).length).toBe(1)
    expect(toGray([]).length).toBe(0)
  })
})

describe('changedRatio', () => {
  it('같은 화면이면 0, 전부 크게 바뀌면 1 이다', () => {
    const a = frame([10, 10, 10, 10])
    expect(changedRatio(a, a)).toBe(0)
    expect(changedRatio(a, frame([200, 200, 200, 200]))).toBe(1)
  })

  it('기준(PIXEL_DELTA=40) 이상 달라진 칸만 센다 (경계 포함)', () => {
    const prev = frame([100, 100, 100, 100])
    expect(changedRatio(prev, frame([100 + PIXEL_DELTA - 1, 100, 100, 100]))).toBe(0) // 기준 미만
    expect(changedRatio(prev, frame([100 + PIXEL_DELTA, 100 - PIXEL_DELTA, 100, 100]))).toBe(0.5) // 기준 이상 두 칸
  })

  it('아주 조금씩 변하는 센서 잡음은 움직임으로 세지 않는다', () => {
    const prev = frame(Array.from({ length: 100 }, () => 100))
    const noisy = frame(Array.from({ length: 100 }, (_, i) => 100 + (i % 3)))
    expect(changedRatio(prev, noisy)).toBe(0)
    // 자동 밝기 조절·옷감의 은은한 변화 정도(30)도 움직임으로 세지 않는다
    expect(changedRatio(prev, frame(Array.from({ length: 100 }, () => 130)))).toBe(0)
  })

  it('크기가 다르거나 비어 있으면 비교하지 않고 0 이다 (지어내지 않는다)', () => {
    expect(changedRatio(frame([]), frame([]))).toBe(0)
    expect(changedRatio(frame([1, 2]), frame([1, 2, 3]))).toBe(0)
  })
})

describe('MotionTrigger (구간 평균)', () => {
  const make = (
    extra: Partial<{ threshold: number; minFrames: number; cooldownMs: number }> = {},
  ) => new MotionTrigger({ threshold: 0.2, minFrames: 3, ...DEFAULT_TRIGGER, ...extra })
  const run = (t: MotionTrigger, ratios: number[], startMs = 0) =>
    ratios.map((r, i) => t.push(r, startMs + i * 150))

  it('구간이 다 차기 전에는 확정하지 않는다', () => {
    const t = make()
    expect(run(t, [1, 1])).toEqual([false, false])
  })

  it('구간 평균이 기준 이상이어야 확정한다 (평균 미달이면 일시적으로 컸어도 확정하지 않는다)', () => {
    const t = make()
    // 한 장만 아주 크고 나머지는 없음 → 평균 0.33 이지만 기준 0.2 이상이므로 확정, 대조로 더 낮추면 미확정
    expect(run(make({ threshold: 0.5 }), [1, 0, 0])).toEqual([false, false, false]) // 평균 0.33 < 0.5
    expect(run(t, [0.3, 0.3, 0.3])).toEqual([false, false, true]) // 평균 0.3 ≥ 0.2
  })

  it('평균이 기준 바로 아래면 아니고, 같으면 움직임이다 (경계)', () => {
    expect(run(make({ threshold: 0.3 }), [0.3, 0.3, 0.2999]).at(-1)).toBe(false)
    expect(run(make({ threshold: 0.3 }), [0.3, 0.3, 0.3]).at(-1)).toBe(true)
  })

  it('확정한 뒤 대기 시간 안에는 다시 확정하지 않고, 지나면 다시 확정한다', () => {
    const t = make({ cooldownMs: 5000 })
    expect(run(t, [1, 1, 1])).toContain(true)
    expect(run(t, [1, 1, 1], 450)).not.toContain(true) // 대기 중
    expect(run(t, [1, 1, 1], 5500)).toContain(true) // 대기 끝
  })

  it('민감도를 바꾸면 기준과 평균 구간이 바뀌고 모아 둔 값은 처음부터 다시 모은다', () => {
    const t = make({ threshold: 0.9 })
    t.push(0.9, 0)
    t.setSensitivity(0.01, 4)
    expect(run(t, [0.02, 0.02, 0.02], 100)).toEqual([false, false, false]) // 4장 필요
    expect(t.push(0.02, 550)).toBe(true)
  })

  it('reset 하면 대기 시간과 모아 둔 값이 모두 없어진다', () => {
    const t = make({ minFrames: 1 })
    expect(t.push(1, 0)).toBe(true)
    expect(t.push(1, 100)).toBe(false)
    t.reset()
    expect(t.push(1, 200)).toBe(true)
  })

  it('민감도가 높을수록 기준이 낮고 평균 구간이 짧다', () => {
    expect(MOTION_RATIO_THRESHOLD.HIGH).toBeLessThan(MOTION_RATIO_THRESHOLD.MEDIUM)
    expect(MOTION_RATIO_THRESHOLD.MEDIUM).toBeLessThan(MOTION_RATIO_THRESHOLD.LOW)
    expect(MOTION_MIN_FRAMES.HIGH).toBeLessThan(MOTION_MIN_FRAMES.MEDIUM)
    expect(MOTION_MIN_FRAMES.MEDIUM).toBeLessThan(MOTION_MIN_FRAMES.LOW)
  })

  describe('실제 화면에서 본 상황 (기본 "낮음")', () => {
    const low = () =>
      new MotionTrigger({
        threshold: MOTION_RATIO_THRESHOLD.LOW,
        minFrames: MOTION_MIN_FRAMES.LOW,
        ...DEFAULT_TRIGGER,
      })

    it('기본은 가장 둔한 "낮음"이다', () => {
      expect(DEFAULT_MOTION_SENSITIVITY).toBe('LOW')
    })

    it('가만히 앉아 손으로 얼굴을 만지는 정도(칸의 약 17%가 계속 달라짐)는 아무리 오래 이어져도 확정하지 않는다', () => {
      const t = low()
      const results = Array.from({ length: 60 }, (_, i) => t.push(0.173, i * 150)) // 9초
      expect(results).not.toContain(true)
    })

    it('뒤척임처럼 1~2초 안에 끝나는 큰 변화는 평균이 낮아 확정하지 않는다', () => {
      const t = low()
      const burst = [0.5, 0.5, 0.5, 0.5, 0.5].concat(Array.from({ length: 15 }, () => 0))
      expect(burst.map((r, i) => t.push(r, i * 150))).not.toContain(true)
    })

    it('잠깐(0.45초) 화면 전체가 확 바뀌고 끝나는 변화는 평균이 기준에 닿아도 확정하지 않는다', () => {
      const t = low()
      const flash = [1, 1, 1].concat(Array.from({ length: 7 }, () => 0)) // 평균 0.3 = 기준
      expect(flash.map((r, i) => t.push(r, i * 150))).not.toContain(true)
    })

    it('몸 전체가 칸을 가로질러 크게 움직이는 것(칸의 약 40%가 1.5초 이상 달라짐)은 확정한다', () => {
      const t = low()
      const results = Array.from({ length: MOTION_MIN_FRAMES.LOW }, (_, i) => t.push(0.4, i * 150))
      expect(results.at(-1)).toBe(true)
    })

    it('한 번 확정한 뒤에는 같은 칸에서 5초 동안 다시 확정하지 않는다', () => {
      const t = low()
      const first = Array.from({ length: 10 }, (_, i) => t.push(0.5, i * 150))
      expect(first.at(-1)).toBe(true)
      const again = Array.from({ length: 10 }, (_, i) => t.push(0.5, 1500 + i * 150))
      expect(again).not.toContain(true) // 대기 중(3초 안)
    })
  })
})

describe('regionRatios (화면을 가로로 나눈 칸별 변화)', () => {
  /** 6x2 흑백 화면. 값 하나를 바꿔 어느 칸이 달라졌는지 본다. */
  const W = 6
  const H = 2
  const still = () => Array.from({ length: W * H }, () => 100)
  const changeColumns = (cols: number[]) => {
    const f = still()
    for (let y = 0; y < H; y += 1) for (const x of cols) f[y * W + x] = 200
    return f
  }

  it('왼쪽 칸만 달라지면 첫 칸만 1 이다 (3칸)', () => {
    expect(regionRatios(still(), changeColumns([0, 1]), W, H, 3)).toEqual([1, 0, 0])
  })

  it('가운데와 오른쪽이 달라지면 그 칸들만 센다', () => {
    expect(regionRatios(still(), changeColumns([2, 3, 4, 5]), W, H, 3)).toEqual([0, 1, 1])
  })

  it('칸 안에서 일부만 달라지면 비율로 돌려준다', () => {
    // 첫 칸(열 0·1, 4칸) 중 열 0 만 변화 → 0.5
    expect(regionRatios(still(), changeColumns([0]), W, H, 3)).toEqual([0.5, 0, 0])
  })

  it('한 칸이면 화면 전체 비율이다', () => {
    expect(regionRatios(still(), changeColumns([0, 1, 2]), W, H, 1)).toEqual([0.5])
  })

  it('크기가 맞지 않거나 칸 수가 너무 많으면 지어내지 않고 0 이다', () => {
    expect(regionRatios([1, 2], [1, 2, 3], W, H, 3)).toEqual([0, 0, 0])
    expect(regionRatios(still(), still(), W, H, 7)).toEqual(Array(7).fill(0))
    expect(regionRatios([], [], 0, 0, 3)).toEqual([0, 0, 0])
  })

  it('경계: 밝기 변화가 기준 미만이면 세지 않는다', () => {
    const slight = still().map((v) => v + 24)
    expect(regionRatios(still(), slight, W, H, 3)).toEqual([0, 0, 0])
  })
})

describe('구역별 판정 기준 (침대 주변은 엄격, 이동 경로·현관은 예민)', () => {
  const trigger = (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE') => {
    const rule = motionRule(zone, 'LOW')
    return new MotionTrigger({ ...rule, ...DEFAULT_TRIGGER })
  }
  const feed = (t: MotionTrigger, ratio: number, frames: number) =>
    Array.from({ length: frames }, (_, i) => t.push(ratio, i * 150))

  it('침대 주변은 지금까지의 엄격한 기준 그대로다', () => {
    for (const level of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      expect(motionRule('BED_SIDE', level)).toEqual({
        threshold: MOTION_RATIO_THRESHOLD[level],
        minFrames: MOTION_MIN_FRAMES[level],
      })
    }
  })

  it('이동 경로·현관은 같은 민감도에서 기준이 더 낮고 짧게 이어져도 확정한다', () => {
    for (const level of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      for (const zone of ['PATH', 'ENTRANCE'] as const) {
        const rule = motionRule(zone, level)
        expect(rule).toEqual(PASSAGE_MOTION_RULES[level])
        expect(rule.threshold).toBeLessThan(MOTION_RATIO_THRESHOLD[level])
        expect(rule.minFrames).toBeLessThanOrEqual(MOTION_MIN_FRAMES[level])
      }
    }
  })

  it('현관을 0.9초 동안 사람이 지나가면(칸의 약 30%) 현관은 잡고 침대 주변 기준으로는 잡지 않는다', () => {
    expect(feed(trigger('ENTRANCE'), 0.3, 6)).toContain(true)
    expect(feed(trigger('BED_SIDE'), 0.3, 6)).not.toContain(true)
  })

  it('현관에서도 가만히 앉아 손으로 얼굴을 만지는 정도(약 17%)는 잡지 않는다', () => {
    expect(feed(trigger('ENTRANCE'), 0.173, 60)).not.toContain(true)
    expect(feed(trigger('PATH'), 0.173, 60)).not.toContain(true)
  })
})
