import type { SocketStatus } from '@/lib/socket'
import type { ServerStatus } from './useServerStatus'

/**
 * 시스템 연결 상태 네 가지.
 *  ok           : 서버가 정상 응답하고 실시간 연결도 살아 있다. 화면의 정보를 "지금" 것으로 볼 수 있다.
 *  connecting   : 연결을 시도하거나 다시 연결하는 중이다.
 *  disconnected : 서버나 인터넷에 닿지 못하거나 실시간 연결이 끊겼다.
 *  unknown      : 서버가 응답은 했지만 정상인지 확인하지 못했다.
 */
export type ConnectionState = 'ok' | 'connecting' | 'disconnected' | 'unknown'

export interface ConnectionInput {
  online: boolean
  server: ServerStatus
  socket: SocketStatus
}

export interface ConnectionInfo {
  state: ConnectionState
  /** 배지에 쓰는 짧은 말 */
  label: string
  /** 이유를 설명하는 한 문장 */
  detail: string
}

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  ok: '연결 정상',
  connecting: '연결 중',
  disconnected: '연결 끊김',
  unknown: '연결 확인 불가',
}

/**
 * 서버·실시간 연결·인터넷 상태를 하나의 연결 상태로 합친다. (순수 함수)
 * 하나라도 정상이 아니면 "정상"으로 보이지 않는다. 아래 순서가 곧 우선순위다.
 */
export function deriveConnection({ online, server, socket }: ConnectionInput): ConnectionInfo {
  const make = (state: ConnectionState, detail: string): ConnectionInfo => ({
    state,
    label: CONNECTION_LABELS[state],
    detail,
  })

  if (!online) return make('disconnected', '인터넷 연결이 끊겨 있습니다.')

  if (server.state === 'error') {
    return server.unreachable
      ? make('disconnected', '서버에 연결할 수 없습니다.')
      : make('unknown', server.message)
  }

  if (socket === 'disconnected' || socket === 'error') {
    return make('disconnected', '실시간 연결이 끊겼습니다. 다시 연결하는 중입니다.')
  }

  if (server.state === 'checking') return make('connecting', '서버 상태를 확인하는 중입니다.')
  if (socket === 'idle' || socket === 'connecting') {
    return make('connecting', '실시간 연결을 만드는 중입니다.')
  }

  return make('ok', '서버 응답 정상 · 실시간 연결됨')
}
