import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@tetris/shared'
import { env } from '@/lib/env'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** idle: 아직 연결을 시도하지 않음 */
export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * 실시간 연결의 상태 기록. 화면의 연결 안내·설정의 연결 상태가 쓴다.
 * 소켓 메시지만으로 데이터의 완전성을 보장하지 않는다. 연결이 돌아오면(connect) 화면이 REST 로 다시 읽는다.
 */
export interface SocketInfo {
  status: SocketStatus
  /** 지금 끊김에서 다시 연결을 시도한 횟수. 연결되면 0 으로 돌아간다. */
  reconnectAttempts: number
  /** 연결이 끊겼다가 다시 연결에 성공한 누적 횟수 (처음 연결은 세지 않는다) */
  reconnectCount: number
  /** 마지막으로 연결에 성공한 시각. 한 번도 없으면 null */
  lastConnectedAt: Date | null
  lastDisconnectedAt: Date | null
  /** 마지막 연결 실패 이유. 연결되면 null */
  lastError: string | null
}

const INITIAL_INFO: SocketInfo = {
  status: 'idle',
  reconnectAttempts: 0,
  reconnectCount: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
}

const socketOptions = { autoConnect: false, withCredentials: true } as const

// 주소가 없으면 현재 페이지와 같은 출처로 연결한다. (개발 중에는 Vite 프록시가 서버로 전달)
// 끊기면 socket.io 가 점점 늘어나는 간격으로 자동 재연결한다.
export const socket: AppSocket = env.apiBaseUrl
  ? io(env.apiBaseUrl, socketOptions)
  : io(socketOptions)

let info: SocketInfo = INITIAL_INFO
let everConnected = false
const listeners = new Set<() => void>()

function update(patch: Partial<SocketInfo>): void {
  const next = { ...info, ...patch }
  // 바뀐 것이 없으면 같은 객체를 유지한다. (구독하는 화면이 불필요하게 다시 그려지지 않게)
  if ((Object.keys(patch) as (keyof SocketInfo)[]).every((key) => info[key] === next[key])) return
  info = next
  listeners.forEach((listener) => listener())
}

/** 소켓의 연결 이벤트를 기록한다. (시계를 바꿔 끼울 수 있어 테스트하기 쉽다) */
export function trackSocket(
  target: Pick<AppSocket, 'on'> & {
    io: { on: (event: string, handler: (n: number) => void) => unknown }
  },
  now: () => Date = () => new Date(),
): void {
  target.on('connect', () => {
    update({
      status: 'connected',
      reconnectCount: everConnected ? info.reconnectCount + 1 : info.reconnectCount,
      reconnectAttempts: 0,
      lastConnectedAt: now(),
      lastError: null,
    })
    everConnected = true
  })
  target.on('disconnect', () => update({ status: 'disconnected', lastDisconnectedAt: now() }))
  target.on('connect_error', (error: Error) =>
    update({ status: 'error', lastError: error.message || '연결하지 못했습니다.' }),
  )
  target.io.on('reconnect_attempt', (attempt: number) =>
    update({ status: 'connecting', reconnectAttempts: attempt }),
  )
}

trackSocket(socket as unknown as Parameters<typeof trackSocket>[0])

/** 테스트에서 기록을 처음 상태로 돌린다. */
export function resetSocketInfo(): void {
  info = INITIAL_INFO
  everConnected = false
  listeners.forEach((listener) => listener())
}

export function connectSocket(): void {
  if (socket.active) return
  update({ status: 'connecting' })
  socket.connect()
}

export function disconnectSocket(): void {
  socket.disconnect()
  update({ status: 'idle', reconnectAttempts: 0 })
}

export function subscribeSocketStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSocketStatus(): SocketStatus {
  return info.status
}

export function getSocketInfo(): SocketInfo {
  return info
}
