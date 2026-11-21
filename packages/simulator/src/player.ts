import type { Scenario, ScenarioAction } from '@tetris/shared'

export interface PlayOptions {
  /** 배속. 단계 사이의 기다리는 시간만 줄어든다. */
  speed: number
  /** 단계 하나를 실행한다. 실제 센서와 같은 수집 API 를 부르는 일은 호출하는 쪽이 정한다. */
  perform(action: ScenarioAction, stepIndex: number): Promise<void>
  /** 취소할 수 있는 대기. 기본은 타이머. 테스트에서는 가짜로 바꾼다. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  signal: AbortSignal
  onProgress?: (completedSteps: number, totalSteps: number) => void
}

export type PlayOutcome = 'COMPLETED' | 'STOPPED'

/** 취소되면 바로 깨어나는 타이머 대기 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || ms <= 0) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * 시나리오를 단계 순서대로 재생한다. 취소되면 남은 단계를 보내지 않고 STOPPED 를 돌려준다.
 * 단계 실행이 실패하면(서버에 닿지 못함 등) 오류를 그대로 던져 실패를 숨기지 않는다.
 */
export async function playScenario(scenario: Scenario, options: PlayOptions): Promise<PlayOutcome> {
  if (!(options.speed > 0)) throw new Error('배속은 0보다 커야 합니다.')
  const sleep = options.sleep ?? abortableSleep
  const steps = [...scenario.steps].sort((a, b) => a.atSeconds - b.atSeconds)

  let previousAt = 0
  for (const [index, step] of steps.entries()) {
    await sleep(((step.atSeconds - previousAt) * 1000) / options.speed, options.signal)
    if (options.signal.aborted) return 'STOPPED'
    previousAt = step.atSeconds
    await options.perform(step.action, index)
    options.onProgress?.(index + 1, steps.length)
  }
  return 'COMPLETED'
}
