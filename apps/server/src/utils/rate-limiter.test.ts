import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rate-limiter'

function setup(limit = 3, windowMs = 60_000) {
  let current = 1_000_000
  return {
    limiter: new RateLimiter(() => new Date(current), limit, windowMs),
    advance: (ms: number) => (current += ms),
  }
}

describe('RateLimiter', () => {
  it('한도까지는 허용하고 넘으면 남은 시간을 알려 준다', () => {
    const { limiter, advance } = setup()
    for (let i = 0; i < 3; i += 1) expect(limiter.consume('a').allowed).toBe(true)
    const blocked = limiter.consume('a')
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 60 })
    advance(20_000)
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterSeconds: 40 })
  })

  it('시간 창이 지나면 다시 허용한다', () => {
    const { limiter, advance } = setup()
    for (let i = 0; i < 4; i += 1) limiter.consume('a')
    advance(60_000)
    expect(limiter.consume('a').allowed).toBe(true)
  })

  it('키마다 따로 센다', () => {
    const { limiter } = setup(1)
    expect(limiter.consume('a').allowed).toBe(true)
    expect(limiter.consume('a').allowed).toBe(false)
    expect(limiter.consume('b').allowed).toBe(true)
  })
})
