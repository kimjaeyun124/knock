import { describe, expect, it } from 'vitest'
import type { HealthResponse } from '@tetris/shared'
import type { SocketStatus } from '@/lib/socket'
import { HEALTH_BODY } from '@/test/helpers'
import { deriveConnection, type ConnectionState } from './connection'
import type { ServerStatus } from './useServerStatus'

const ok: ServerStatus = { state: 'ok', health: HEALTH_BODY as HealthResponse }
const checking: ServerStatus = { state: 'checking' }
const unreachable: ServerStatus = {
  state: 'error',
  message: '서버에 연결할 수 없습니다.',
  unreachable: true,
}
const unhealthy: ServerStatus = {
  state: 'error',
  message: '데이터베이스에 연결할 수 없습니다.',
  unreachable: false,
}

function state(server: ServerStatus, socket: SocketStatus, online = true): ConnectionState {
  return deriveConnection({ online, server, socket }).state
}

describe('deriveConnection (연결 상태 네 가지)', () => {
  it('서버가 정상이고 실시간 연결도 살아 있을 때만 "정상"이다', () => {
    expect(state(ok, 'connected')).toBe('ok')
    for (const socket of ['idle', 'connecting', 'disconnected', 'error'] as const) {
      expect(state(ok, socket), `실시간 연결 ${socket}`).not.toBe('ok')
    }
    expect(state(checking, 'connected')).not.toBe('ok')
  })

  it('처음 확인하는 동안과 다시 연결하는 동안은 "연결 중"이다', () => {
    expect(state(checking, 'idle')).toBe('connecting')
    expect(state(checking, 'connecting')).toBe('connecting')
    expect(state(ok, 'idle')).toBe('connecting')
    expect(state(ok, 'connecting')).toBe('connecting')
  })

  it('실시간 연결이 끊기거나 실패하면 서버가 정상이어도 "연결 끊김"이다', () => {
    expect(state(ok, 'disconnected')).toBe('disconnected')
    expect(state(ok, 'error')).toBe('disconnected')
  })

  it('서버에 닿지 못하면 "연결 끊김", 서버가 응답했지만 정상이 아니면 "연결 확인 불가"이다', () => {
    expect(state(unreachable, 'connected')).toBe('disconnected')
    expect(state(unhealthy, 'connected')).toBe('unknown')
    expect(deriveConnection({ online: true, server: unhealthy, socket: 'connected' }).detail).toBe(
      '데이터베이스에 연결할 수 없습니다.',
    )
  })

  it('브라우저가 인터넷이 끊겼다고 알리면 다른 상태와 상관없이 "연결 끊김"이다', () => {
    expect(state(ok, 'connected', false)).toBe('disconnected')
    expect(state(checking, 'idle', false)).toBe('disconnected')
  })

  it('상태마다 서로 다른 짧은 이름을 붙인다', () => {
    const labels = [
      deriveConnection({ online: true, server: ok, socket: 'connected' }).label,
      deriveConnection({ online: true, server: checking, socket: 'idle' }).label,
      deriveConnection({ online: false, server: ok, socket: 'connected' }).label,
      deriveConnection({ online: true, server: unhealthy, socket: 'connected' }).label,
    ]
    expect(labels).toEqual(['연결 정상', '연결 중', '연결 끊김', '연결 확인 불가'])
  })
})
