import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import {
  ApiErrorBodySchema,
  HeartbeatResponseSchema,
  IngestEventsResponseSchema,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type IngestEvent,
  type IngestEventsResponse,
} from '@tetris/shared'

/** 수집 API 호출 실패. status 0 은 서버에 닿지 못한 경우. */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message)
    this.name = 'IngestError'
  }
}

export interface IngestClientOptions {
  baseUrl: string
  /** 앱에서 센서를 등록할 때 한 번 보여 주는 장치 토큰 */
  token: string
  fetch?: typeof fetch
}

/**
 * 장치 수집 API(docs/INGEST_CONTRACT.md) 클라이언트.
 * 시뮬레이터는 실제 센서와 똑같이 이 API 만 사용한다. (시뮬레이터 전용 지름길 없음)
 */
export class IngestClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchImpl: typeof fetch

  constructor(options: IngestClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetchImpl = options.fetch ?? fetch
  }

  sendEvents(events: IngestEvent[]): Promise<IngestEventsResponse> {
    return this.post('/api/ingest/v1/events', { events }, IngestEventsResponseSchema)
  }

  /** 움직임 이벤트 `count`건을 새 ID 로 보낸다. `eventId` 를 주면 그 ID 로 한 건만 보낸다. */
  sendMotion(
    options: { count?: number; occurredAt?: Date | string; eventId?: string } = {},
  ): Promise<IngestEventsResponse> {
    const count = options.eventId ? 1 : (options.count ?? 1)
    const occurredAt =
      options.occurredAt === undefined
        ? undefined
        : options.occurredAt instanceof Date
          ? options.occurredAt.toISOString()
          : options.occurredAt
    const events: IngestEvent[] = Array.from({ length: count }, () => ({
      eventId: options.eventId ?? randomUUID(),
      type: 'MOTION',
      ...(occurredAt ? { occurredAt } : {}),
    }))
    return this.sendEvents(events)
  }

  sendHeartbeat(body: HeartbeatRequest = {}): Promise<HeartbeatResponse> {
    return this.post('/api/ingest/v1/heartbeat', body, HeartbeatResponseSchema)
  }

  private async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new IngestError(`서버에 연결하지 못했습니다. (${reason})`, 0)
    }

    const json: unknown = await res.json().catch(() => undefined)
    if (!res.ok) {
      const parsed = ApiErrorBodySchema.safeParse(json)
      throw parsed.success
        ? new IngestError(parsed.data.error.message, res.status, parsed.data.error.code)
        : new IngestError(`서버가 오류로 응답했습니다. (상태 코드 ${res.status})`, res.status)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      throw new IngestError('서버 응답이 수집 계약과 다릅니다.', res.status)
    }
    return parsed.data
  }
}
