import { describe, expect, it } from 'vitest'
import { LoginThrottle } from './login-throttle'

function setup(maxFailures = 3, windowMs = 60_000) {
  let current = 1_000_000
  const throttle = new LoginThrottle(() => new Date(current), maxFailures, windowMs)
  return { throttle, advance: (ms: number) => (current += ms) }
}

describe('LoginThrottle', () => {
  it('한도 전까지는 막지 않는다', () => {
    const { throttle } = setup()
    throttle.recordFailure('a')
    throttle.recordFailure('a')
    expect(throttle.retryAfterSeconds('a')).toBe(0)
  })

  it('한도에 도달하면 남은 시간(초)을 알려 준다', () => {
    const { throttle, advance } = setup()
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a')
    expect(throttle.retryAfterSeconds('a')).toBe(60)
    advance(30_000)
    expect(throttle.retryAfterSeconds('a')).toBe(30)
  })

  it('제한 시간이 지나면 풀린다', () => {
    const { throttle, advance } = setup()
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a')
    advance(60_000)
    expect(throttle.retryAfterSeconds('a')).toBe(0)
  })

  it('키가 다르면 서로 영향을 주지 않는다 (다른 IP가 계정을 잠가 버릴 수 없음)', () => {
    const { throttle } = setup()
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('attacker-ip|guardian@example.com')
    expect(throttle.retryAfterSeconds('guardian-ip|guardian@example.com')).toBe(0)
  })

  it('reset 하면 실패 횟수가 지워진다', () => {
    const { throttle } = setup()
    for (let i = 0; i < 3; i += 1) throttle.recordFailure('a')
    throttle.reset('a')
    expect(throttle.retryAfterSeconds('a')).toBe(0)
  })
})
