/**
 * 같은 키의 작업을 한 번에 하나씩 순서대로 실행한다. (다른 키끼리는 동시에 실행)
 * 같은 가구의 알림 생성·병합·확인이 서로 엇갈려 알림이 중복으로 생기거나 상태가 덮어써지는 것을 막는다.
 * 프로세스 하나에서만 유효하다. (서버를 여러 대로 늘리면 DB 수준 잠금이 필요하다)
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const result = previous.then(task)
    const tail = result.then(
      () => undefined,
      () => undefined,
    )
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return result
  }
}
