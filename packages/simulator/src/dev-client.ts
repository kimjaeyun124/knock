import type { z } from 'zod'
import {
  ApiErrorBodySchema,
  AuthSessionResponseSchema,
  DataSummaryResponseSchema,
  DeleteSimulatedResponseSchema,
  SimulatorStateSchema,
  type DataSummaryResponse,
  type DeleteSimulatedResponse,
  type SimulatorSpeed,
  type SimulatorState,
  type ZoneKind,
} from '@tetris/shared'

/** 개발 API 호출 실패. status 0 은 서버에 닿지 못한 경우. */
export class DevApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'DevApiError'
  }
}

/**
 * 서버의 시뮬레이터 개발 API(/api/dev/simulator, SIMULATOR_ENABLED 일 때만 있음) 클라이언트.
 * 보호자 계정으로 로그인해서 쓴다. 실제 신호는 서버가 수집 API 로 보낸다.
 */
export class DevClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private cookie: string | null = null

  constructor(options: { baseUrl: string; fetch?: typeof fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetch ?? fetch
  }

  async login(email: string, password: string): Promise<void> {
    await this.request('POST', '/api/auth/login', AuthSessionResponseSchema, { email, password })
  }

  state(): Promise<SimulatorState> {
    return this.request('GET', '/api/dev/simulator/state', SimulatorStateSchema)
  }

  ensureSensors(): Promise<SimulatorState> {
    return this.request('POST', '/api/dev/simulator/sensors', SimulatorStateSchema)
  }

  motion(zone: ZoneKind): Promise<SimulatorState> {
    return this.request('POST', '/api/dev/simulator/motion', SimulatorStateSchema, { zone })
  }

  runScenario(id: string, speed: SimulatorSpeed): Promise<SimulatorState> {
    return this.request(
      'POST',
      `/api/dev/simulator/scenarios/${encodeURIComponent(id)}/run`,
      SimulatorStateSchema,
      { speed },
    )
  }

  stopScenario(): Promise<SimulatorState> {
    return this.request('POST', '/api/dev/simulator/scenarios/stop', SimulatorStateSchema)
  }

  setDeliveryFailure(enabled: boolean): Promise<SimulatorState> {
    return this.request('POST', '/api/dev/simulator/faults', SimulatorStateSchema, {
      deliveryFailure: enabled,
    })
  }

  dataSummary(): Promise<DataSummaryResponse> {
    return this.request('GET', '/api/data/summary', DataSummaryResponseSchema)
  }

  deleteSimulatedData(): Promise<DeleteSimulatedResponse> {
    return this.request('DELETE', '/api/data/simulated', DeleteSimulatedResponseSchema)
  }

  private async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new DevApiError(`서버에 연결하지 못했습니다. (${reason})`, 0)
    }

    for (const setCookie of res.headers.getSetCookie()) {
      const pair = setCookie.split(';')[0] ?? ''
      if (pair.includes('=')) this.cookie = pair
    }

    const json: unknown = await res.json().catch(() => undefined)
    if (!res.ok) {
      const parsed = ApiErrorBodySchema.safeParse(json)
      const hint =
        res.status === 404 && path.includes('/dev/simulator')
          ? ' (서버의 SIMULATOR_ENABLED 가 꺼져 있을 수 있습니다)'
          : ''
      throw new DevApiError(
        parsed.success
          ? `${parsed.data.error.message}${hint}`
          : `서버가 오류로 응답했습니다.${hint}`,
        res.status,
      )
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new DevApiError('서버 응답이 계약과 다릅니다.', res.status)
    return parsed.data
  }
}
