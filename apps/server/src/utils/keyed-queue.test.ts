import { describe, expect, it } from 'vitest'
import { KeyedQueue } from './keyed-queue'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('KeyedQueue', () => {
  it('같은 키의 작업은 들어온 순서대로 하나씩 실행된다', async () => {
    const queue = new KeyedQueue()
    const log: string[] = []
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`)
      await sleep(ms)
      log.push(`${name}:end`)
    }
    await Promise.all([
      queue.run('a', task('1', 20)),
      queue.run('a', task('2', 1)),
      queue.run('a', task('3', 1)),
    ])
    expect(log).toEqual(['1:start', '1:end', '2:start', '2:end', '3:start', '3:end'])
  })

  it('다른 키의 작업은 서로 기다리지 않는다', async () => {
    const queue = new KeyedQueue()
    const log: string[] = []
    await Promise.all([
      queue.run('a', async () => {
        await sleep(20)
        log.push('a')
      }),
      queue.run('b', () => {
        log.push('b')
        return Promise.resolve()
      }),
    ])
    expect(log).toEqual(['b', 'a'])
  })

  it('앞 작업이 실패해도 다음 작업은 실행되고, 실패는 호출자에게 전달된다', async () => {
    const queue = new KeyedQueue()
    const failing = queue.run('a', () => Promise.reject(new Error('실패')))
    const next = queue.run('a', () => Promise.resolve('ok'))
    await expect(failing).rejects.toThrow('실패')
    await expect(next).resolves.toBe('ok')
  })
})
