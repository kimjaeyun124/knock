type Handler = (...args: unknown[]) => void

/** 테스트용 소켓 대역. 실제 연결 없이 이벤트를 주고받는다. */
class FakeSocket {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): this {
    const set = this.handlers.get(event) ?? new Set<Handler>()
    set.add(handler)
    this.handlers.set(event, set)
    return this
  }

  off(event: string, handler: Handler): this {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  /** 서버가 이벤트를 보낸 것처럼 구독자에게 전달한다. */
  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((handler) => handler(...args))
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0
  }

  reset(): void {
    this.handlers.clear()
  }
}

export const fakeSocket = new FakeSocket()

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * 테스트용 연결 상태. 기본은 idle(아직 연결 전)이며, 테스트가 `set` 으로 바꾸면 화면이 따라 바뀐다.
 * (실제 상태 저장소는 lib/socket.ts 에 있고 테스트에서는 이 대역으로 바꿔 쓴다)
 */
interface FakeInfo {
  status: Status
  reconnectAttempts: number
  reconnectCount: number
  lastConnectedAt: Date | null
  lastDisconnectedAt: Date | null
  lastError: string | null
}

const FRESH_INFO: FakeInfo = {
  status: 'idle',
  reconnectAttempts: 0,
  reconnectCount: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
}

export const fakeSocketStatus = (() => {
  let info: FakeInfo = FRESH_INFO
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  return {
    get: (): Status => info.status,
    /** lib/socket.ts 의 getSocketInfo 와 같은 모양. 바뀌기 전까지 같은 객체를 돌려준다. */
    getInfo: (): FakeInfo => info,
    set(next: Status): void {
      info = { ...info, status: next }
      notify()
    },
    /** 재연결 횟수·마지막 연결 시각 같은 기록을 테스트가 정한다. */
    setInfo(patch: Partial<FakeInfo>): void {
      info = { ...info, ...patch }
      notify()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    reset(): void {
      info = FRESH_INFO
    },
  }
})()
