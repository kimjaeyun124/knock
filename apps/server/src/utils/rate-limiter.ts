const MAX_TRACKED_KEYS = 10_000

interface Window {
  count: number
  startedAt: number
}

/**
 * 고정 시간 창 요청 제한 (메모리 보관, 서버 재시작 시 초기화).
 * consume: 요청 한 번을 세고, 한도를 넘었는지 알려 준다. (장치별 요청 제한)
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>()

  constructor(
    private readonly now: () => Date,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** 요청 한 번을 센다. 한도 안이면 allowed, 넘으면 남은 시간(초)을 알려 준다. */
  consume(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const window = this.touch(key)
    window.count += 1
    return window.count <= this.limit
      ? { allowed: true }
      : { allowed: false, retryAfterSeconds: this.retryAfter(window) }
  }

  private retryAfter(window: Window): number {
    return Math.max(1, Math.ceil((window.startedAt + this.windowMs - this.now().getTime()) / 1000))
  }

  private current(key: string): Window | undefined {
    const window = this.windows.get(key)
    if (!window) return undefined
    if (this.now().getTime() - window.startedAt >= this.windowMs) {
      this.windows.delete(key)
      return undefined
    }
    return window
  }

  private touch(key: string): Window {
    const existing = this.current(key)
    if (existing) return existing
    if (this.windows.size >= MAX_TRACKED_KEYS) this.purgeExpired()
    const created = { count: 0, startedAt: this.now().getTime() }
    this.windows.set(key, created)
    return created
  }

  private purgeExpired(): void {
    const nowMs = this.now().getTime()
    for (const [key, window] of this.windows) {
      if (nowMs - window.startedAt >= this.windowMs) this.windows.delete(key)
    }
  }
}
