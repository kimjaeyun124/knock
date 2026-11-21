interface Entry {
  failures: number
  windowStartedAt: number
}

const MAX_TRACKED_KEYS = 10_000

/**
 * 로그인 실패 횟수 제한 (메모리 보관, 서버 재시작 시 초기화).
 *
 * 키는 "접속 IP + 이메일" 조합이다. 이메일만으로 막으면 제3자가 보호자 계정을
 * 일부러 잠가 버릴 수 있는데, 야간 알림을 받아야 하는 서비스에서는 그 피해가 더 크다.
 * 여러 IP에서 분산해 추측하는 공격은 비밀번호 해시 비용(scrypt)으로 늦춘다.
 */
export class LoginThrottle {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly now: () => Date,
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  /** 잠겨 있으면 다시 시도할 수 있을 때까지 남은 초, 아니면 0 */
  retryAfterSeconds(key: string): number {
    const entry = this.current(key)
    if (!entry || entry.failures < this.maxFailures) return 0
    const remainingMs = entry.windowStartedAt + this.windowMs - this.now().getTime()
    return Math.max(1, Math.ceil(remainingMs / 1000))
  }

  recordFailure(key: string): void {
    const entry = this.current(key)
    if (entry) {
      entry.failures += 1
      return
    }
    if (this.entries.size >= MAX_TRACKED_KEYS) this.purgeExpired()
    this.entries.set(key, { failures: 1, windowStartedAt: this.now().getTime() })
  }

  reset(key: string): void {
    this.entries.delete(key)
  }

  /** 제한 시간이 지난 항목은 없는 것으로 취급하며 지운다. */
  private current(key: string): Entry | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now().getTime() - entry.windowStartedAt >= this.windowMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  private purgeExpired(): void {
    const nowMs = this.now().getTime()
    for (const [key, entry] of this.entries) {
      if (nowMs - entry.windowStartedAt >= this.windowMs) this.entries.delete(key)
    }
  }
}
