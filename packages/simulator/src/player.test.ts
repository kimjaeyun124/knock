import { describe, expect, it } from 'vitest'
import { SCENARIOS, findScenario, type ScenarioAction } from '@tetris/shared'
import { playScenario } from './player'

function setup(speed = 1) {
  const controller = new AbortController()
  const sleeps: number[] = []
  const performed: ScenarioAction[] = []
  const progress: [number, number][] = []
  return {
    controller,
    sleeps,
    performed,
    progress,
    options: {
      speed,
      signal: controller.signal,
      sleep: (ms: number) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
      perform: (action: ScenarioAction) => {
        performed.push(action)
        return Promise.resolve()
      },
      onProgress: (done: number, total: number) => progress.push([done, total]),
    },
  }
}

describe('playScenario', () => {
  it('단계 사이의 간격만큼 기다리며 순서대로 보낸다', async () => {
    const t = setup()
    const outcome = await playScenario(findScenario('bed-to-path')!, t.options)
    expect(outcome).toBe('COMPLETED')
    expect(t.sleeps).toEqual([0, 120_000])
    expect(t.performed.map((a) => (a.kind === 'motion' ? a.zone : a.kind))).toEqual([
      'BED_SIDE',
      'PATH',
    ])
    expect(t.progress).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('배속만큼 기다리는 시간이 줄어든다', async () => {
    const t = setup(60)
    await playScenario(findScenario('bed-to-path')!, t.options)
    expect(t.sleeps).toEqual([0, 2000])
  })

  it('취소하면 남은 단계를 보내지 않는다', async () => {
    const t = setup()
    t.options.perform = (action) => {
      t.performed.push(action)
      t.controller.abort()
      return Promise.resolve()
    }
    const outcome = await playScenario(findScenario('repeated-movement')!, t.options)
    expect(outcome).toBe('STOPPED')
    expect(t.performed).toHaveLength(1)
  })

  it('단계 실행이 실패하면 오류를 숨기지 않고 던진다', async () => {
    const t = setup()
    t.options.perform = () => Promise.reject(new Error('서버에 연결하지 못했습니다.'))
    await expect(playScenario(findScenario('entrance')!, t.options)).rejects.toThrow(
      '서버에 연결하지 못했습니다.',
    )
  })

  it('잘못된 배속은 거부한다', async () => {
    await expect(playScenario(SCENARIOS[0]!, { ...setup().options, speed: 0 })).rejects.toThrow(
      '배속',
    )
  })

  it('실제 타이머 대기는 취소하면 바로 깨어난다', async () => {
    const { abortableSleep } = await import('./player')
    const controller = new AbortController()
    const started = Date.now()
    const waiting = abortableSleep(30_000, controller.signal)
    controller.abort()
    await waiting
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
