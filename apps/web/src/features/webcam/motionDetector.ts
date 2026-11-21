/**
 * 웹캠 움직임 감지의 계산 부분. 브라우저 API 를 쓰지 않는 순수 함수라 같은 입력이면 항상 같은 결과다.
 *
 * 방식: 작은 흑백 화면(예: 64x48)을 앞뒤로 비교해 "눈에 띄게 달라진 칸의 비율"을 구한다. (프레임 차이)
 * 한계: 사람이 움직인 것과 조명 변화·카메라 자동 노출·흔들림을 구분하지 못한다. 어떤 움직임이든 "화면이 바뀌었다"로만 본다.
 */

/** 빨강·초록·파랑·투명도(RGBA) 픽셀을 밝기 0~255 하나로 바꾼다. */
export function toGray(rgba: ArrayLike<number>): Uint8Array {
  const pixels = Math.floor(rgba.length / 4)
  const gray = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4
    // 사람 눈의 밝기 감도에 가까운 가중치 (정수 연산)
    gray[i] = (rgba[o]! * 77 + rgba[o + 1]! * 150 + rgba[o + 2]! * 29) >> 8
  }
  return gray
}

/**
 * 밝기가 이만큼(0~255) 이상 달라진 칸만 "달라졌다"고 본다. 카메라 잡음·자동 밝기 조절·옷감의 미세한 변화는 이보다 작아
 * 걸러진다. (처음 값 25 에서 40 으로 높였다)
 */
export const PIXEL_DELTA = 40

/**
 * 앞뒤 화면에서 밝기가 pixelDelta 이상 달라진 칸의 비율(0~1).
 * 크기가 다르거나 비어 있으면 비교할 수 없으므로 0 을 돌려준다.
 */
export function changedRatio(
  previous: ArrayLike<number>,
  current: ArrayLike<number>,
  pixelDelta = PIXEL_DELTA,
): number {
  if (previous.length === 0 || previous.length !== current.length) return 0
  let changed = 0
  for (let i = 0; i < current.length; i += 1) {
    if (Math.abs(current[i]! - previous[i]!) >= pixelDelta) changed += 1
  }
  return changed / current.length
}

export const MOTION_SENSITIVITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type MotionSensitivity = (typeof MOTION_SENSITIVITIES)[number]

export const MOTION_SENSITIVITY_LABELS: Record<MotionSensitivity, string> = {
  LOW: '낮음 (크게 움직일 때만 · 뒤척임 제외)',
  MEDIUM: '보통',
  HIGH: '높음 (작은 움직임도)',
}

/**
 * 구역(칸) 하나에서 **평균** 몇 %가 달라져야 움직임으로 볼지. 현장에서 맞춘 값이 아니라 데모용 초기값이다.
 * 가만히 앉아 손으로 얼굴을 만지는 정도도 한 칸의 17% 안팎이 달라졌으므로, 기본(낮음)은 그보다 훨씬 위인 30% 로 두어
 * 몸 전체가 크게 움직이거나 칸을 가로질러 걸을 때만 잡는다. (처음 값 8%·4%·1.5% → 12%·7%·3.5% → 지금 값)
 */
export const MOTION_RATIO_THRESHOLD: Record<MotionSensitivity, number> = {
  LOW: 0.3,
  MEDIUM: 0.18,
  HIGH: 0.1,
}

/**
 * 변화 비율의 평균을 내는 구간의 프레임 수(한 프레임 150ms). 이 구간 전체의 **평균**이 기준 이상이어야 확정한다.
 * 짧은 변화(뒤척임·손짓·밝기 변화)는 평균이 낮아져 걸러지고, 오래 크게 이어지는 움직임만 남는다.
 * 낮음 10 ≈ 1.5초, 보통 6 ≈ 0.9초, 높음 4 ≈ 0.6초.
 */
export const MOTION_MIN_FRAMES: Record<MotionSensitivity, number> = {
  LOW: 10,
  MEDIUM: 6,
  HIGH: 4,
}

export interface MotionRule {
  threshold: number
  minFrames: number
}

/**
 * 구역별 판정 기준. 위의 MOTION_RATIO_THRESHOLD·MOTION_MIN_FRAMES 는 가장 엄격한 **침대 주변** 기준이다.
 * 이동 경로·현관은 사람이 지나가는 곳이라 더 예민하게 본다. (침대 주변은 뒤척임을 거르려 그대로 둔다)
 * 현관·이동 경로 "낮음" 20% 는, 실제 화면에서 가만히 앉아 손으로 얼굴을 만진 정도(17%)보다는 조금 위에 두었다.
 */
export const PASSAGE_MOTION_RULES: Record<MotionSensitivity, MotionRule> = {
  LOW: { threshold: 0.2, minFrames: 6 },
  MEDIUM: { threshold: 0.12, minFrames: 4 },
  HIGH: { threshold: 0.07, minFrames: 3 },
}

/** 구역과 민감도에 맞는 판정 기준 */
export function motionRule(
  zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE',
  sensitivity: MotionSensitivity,
): MotionRule {
  if (zone === 'BED_SIDE') {
    return {
      threshold: MOTION_RATIO_THRESHOLD[sensitivity],
      minFrames: MOTION_MIN_FRAMES[sensitivity],
    }
  }
  return PASSAGE_MOTION_RULES[sensitivity]
}

/** 기본 민감도. 뒤척임 같은 작은 움직임으로 알림이 쌓이지 않게 가장 둔한 값으로 시작한다. */
export const DEFAULT_MOTION_SENSITIVITY: MotionSensitivity = 'LOW'

/**
 * 화면을 가로로 나눈 구역별 변화 비율. 칸 폭은 같고, 각 칸 안에서 밝기가 pixelDelta 이상 달라진 비율(0~1)을 구한다.
 * width·height 는 한 프레임의 칸 수이며, previous·current 는 한 줄씩 이어 붙인 흑백 배열이다.
 * 크기가 맞지 않으면 모두 0 이다.
 */
export function regionRatios(
  previous: ArrayLike<number>,
  current: ArrayLike<number>,
  width: number,
  height: number,
  regions: number,
  pixelDelta = PIXEL_DELTA,
): number[] {
  const zero = Array.from({ length: Math.max(1, regions) }, () => 0)
  if (
    regions < 1 ||
    width < regions ||
    previous.length !== width * height ||
    current.length !== previous.length
  ) {
    return zero
  }
  const changed = zero.map(() => 0)
  const counts = zero.map(() => 0)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const region = Math.min(regions - 1, Math.floor((x * regions) / width))
      const i = y * width + x
      counts[region] = (counts[region] ?? 0) + 1
      if (Math.abs(current[i]! - previous[i]!) >= pixelDelta) {
        changed[region] = (changed[region] ?? 0) + 1
      }
    }
  }
  return changed.map((n, r) => (counts[r] ? n / counts[r] : 0))
}

export interface TriggerOptions {
  /** 이 비율 이상이면 "움직임 있는 화면" */
  threshold: number
  /** 움직임 있는 화면이 연속으로 이만큼 이어져야 움직임으로 확정 (짧은 변화·잡음 제거) */
  minFrames: number
  /** 움직임을 확정한 뒤 이 시간(ms) 동안은 다시 확정하지 않는다 (서버로 보내는 횟수를 제한) */
  cooldownMs: number
}

/** 한 칸에서 움직임을 확정한 뒤 이 시간 동안은 다시 확정하지 않는다. (서버로 보내는 횟수와 알림을 줄인다) */
export const DEFAULT_TRIGGER = { cooldownMs: 5000 } as const

/**
 * 프레임마다 변화 비율을 받아 "움직임이 확정되었는가"를 알려 주는 상태 기계.
 * 시각은 호출하는 쪽이 넘긴다. (시계를 쓰지 않아 시험하기 쉽다)
 */
export class MotionTrigger {
  /** 가장 최근 minFrames 개의 변화 비율 */
  private recent: number[] = []
  private lastFiredAt = Number.NEGATIVE_INFINITY

  constructor(private options: TriggerOptions) {}

  /** 민감도를 바꿀 때: 기준 비율과 평균 구간을 함께 바꾸고 모아 둔 값은 처음부터 다시 모은다. */
  setSensitivity(threshold: number, minFrames: number): void {
    this.options = { ...this.options, threshold, minFrames }
    this.recent = []
  }

  /**
   * true 면 지금 움직임이 확정되었다. 아래를 모두 만족해야 한다.
   *  1) 구간(minFrames 장)이 다 찼다
   *  2) 구간의 평균이 기준 이상이다
   *  3) 구간의 절반 이상이 기준의 절반 이상으로 달라졌다 (잠깐 크게 바뀌고 끝난 변화는 평균만 채워도 걸러진다)
   *  4) 직전 확정에서 대기 시간이 지났다
   */
  push(ratio: number, nowMs: number): boolean {
    this.recent.push(ratio)
    if (this.recent.length > this.options.minFrames) this.recent.shift()
    if (this.recent.length < this.options.minFrames) return false
    const average = this.recent.reduce((sum, value) => sum + value, 0) / this.recent.length
    if (average < this.options.threshold) return false
    const active = this.recent.filter((value) => value >= this.options.threshold / 2).length
    if (active < Math.ceil(this.options.minFrames / 2)) return false
    if (nowMs - this.lastFiredAt < this.options.cooldownMs) return false
    this.lastFiredAt = nowMs
    this.recent = []
    return true
  }

  reset(): void {
    this.recent = []
    this.lastFiredAt = Number.NEGATIVE_INFINITY
  }
}
