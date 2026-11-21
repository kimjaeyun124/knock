import { randomUUID } from 'node:crypto'
import { io as connect, type Socket } from 'socket.io-client'
import { expect, vi } from 'vitest'
import { IngestEventsResponseSchema } from '@tetris/shared'
import type { TestClock } from './context'
import { WEB_ORIGIN, type TestClient } from './http'

/** 한국 시각 2026-11-15 02:00 (야간) */
export const NIGHT = new Date('2026-11-14T17:00:00Z')
/** 한국 시각 2026-11-15 13:00 (낮) */
export const DAY = new Date('2026-11-15T04:00:00Z')
export const MINUTE = 60_000

/** 센서 장치 흉내: 장치 토큰으로 수집 API 를 호출한다. 시각은 테스트 시계를 기준으로 한다. */
export class TestDevice {
  constructor(
    private readonly ctx: { baseUrl: string; clock: TestClock },
    readonly token: string,
  ) {}

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.ctx.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /**
   * 움직임 신호 한 건. 장치는 신호가 생긴 즉시 보내는 것으로 가정한다.
   * - offsetMs > 0: 테스트 시계를 (야간 시작 + offsetMs) 로 앞당겨 그 시각에 발생·도착한 신호 (시계는 뒤로 가지 않는다)
   * - offsetMs <= 0: 지금보다 |offsetMs| 전에 발생했지만 이제야 도착한 신호 (지연 수신)
   */
  async motion(offsetMs = 0): Promise<void> {
    if (offsetMs > 0) {
      this.ctx.clock.set(
        new Date(Math.max(this.ctx.clock.now().getTime(), NIGHT.getTime() + offsetMs)),
      )
    }
    const occurredAt = new Date(
      this.ctx.clock.now().getTime() + (offsetMs <= 0 ? offsetMs : 0),
    ).toISOString()
    const res = await this.post('/api/ingest/v1/events', {
      events: [{ eventId: randomUUID(), type: 'MOTION', occurredAt }],
    })
    expect(res.status).toBe(200)
    const body = IngestEventsResponseSchema.parse(await res.json())
    expect(body.results[0]?.status).toBe('ACCEPTED')
  }

  async heartbeat(body: { batteryPercent?: number } = {}): Promise<void> {
    const res = await this.post('/api/ingest/v1/heartbeat', body)
    expect(res.status).toBe(200)
  }
}

export interface Received {
  event: string
  payload: unknown
}

export interface TestSocket {
  socket: Socket
  received: Received[]
  of(event: string): Received[]
  /** 이벤트가 n 번째 이상 도착할 때까지 기다린다 */
  waitForCount(event: string, count: number): Promise<void>
  close(): void
}

/** 보호자의 앱 화면처럼 실시간 연결을 열고 받은 이벤트를 모은다. */
export async function openSocket(baseUrl: string, client: TestClient): Promise<TestSocket> {
  const socket = connect(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Cookie: client.cookie ?? '', Origin: WEB_ORIGIN },
  })
  const received: Received[] = []
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }))
  await new Promise<void>((resolve, reject) => {
    socket.once('server:ready', () => resolve())
    socket.once('connect_error', (error) => reject(error))
  })
  const of = (event: string) => received.filter((r) => r.event === event)
  return {
    socket,
    received,
    of,
    waitForCount: (event, count) =>
      vi.waitFor(() => expect(of(event).length).toBeGreaterThanOrEqual(count), { timeout: 3000 }),
    close: () => {
      socket.close()
    },
  }
}
