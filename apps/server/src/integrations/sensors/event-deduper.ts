/**
 * 최근에 본 이벤트 키를 기억해 같은 신호가 다시 들어오면 DB 까지 가지 않고 걸러낸다.
 * (MQTT 재전송처럼 어댑터 단계에서 중복이 흔한 통신 방식을 위한 빠른 길이며, 서버를 다시 시작하면 비워진다.
 *  최종 보장은 DB 의 (sensorId, deviceEventId) 유일 제약이다.)
 */
export class EventDeduper {
  private readonly seen = new Map<string, number>()

  constructor(
    private readonly now: () => Date,
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  /** 처음 보는 키면 기억하고 true, 이미 봤으면 false */
  firstSeen(key: string): boolean {
    const nowMs = this.now().getTime()
    const at = this.seen.get(key)
    if (at !== undefined && nowMs - at < this.ttlMs) return false
    this.seen.delete(key)
    if (this.seen.size >= this.maxEntries) this.evict(nowMs)
    this.seen.set(key, nowMs)
    return true
  }

  /** 처리에 실패해 다시 받아야 하는 신호는 기억에서 지운다. */
  forget(key: string): void {
    this.seen.delete(key)
  }

  private evict(nowMs: number): void {
    for (const [key, at] of this.seen) {
      if (nowMs - at >= this.ttlMs) this.seen.delete(key)
    }
    // 만료된 것이 없으면 가장 오래된 것부터 지운다. (Map 은 삽입 순서를 유지)
    while (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.keys().next()
      if (oldest.done) break
      this.seen.delete(oldest.value)
    }
  }
}
