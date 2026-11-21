import type { AdapterState, DataOrigin, SensorAdapterStatus } from '@tetris/shared'
import type { Logger } from '@/utils/logger'
import { normalizeCandidate } from './normalize'
import {
  DEFAULT_RECONNECT_POLICY,
  reconnectDelayMs,
  type NormalizeResult,
  type ReconnectPolicy,
  type SensorAdapter,
  type SensorEventHandler,
  type Unsubscribe,
} from './types'

export interface BaseAdapterOptions {
  now: () => Date
  logger: Logger
  reconnect?: ReconnectPolicy
  /** 재연결 사이의 대기. 테스트에서 기다리지 않게 바꾼다. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * 어댑터 공통 동작: 구독자 관리, 표준 이벤트 정규화·전달, 오류 집계, 재연결.
 * 하위 클래스는 통신 자체(openConnection/closeConnection)와 원본 읽기(parseRaw)만 구현한다.
 */
export abstract class BaseSensorAdapter implements SensorAdapter {
  abstract readonly id: string
  abstract readonly label: string
  abstract readonly origin: DataOrigin
  abstract readonly protocol: string | null

  protected state: AdapterState = 'DISCONNECTED'
  private lastEventAt: Date | null = null
  private errorCount = 0
  private lastError: string | null = null
  private reconnectAttempts = 0
  private readonly handlers = new Set<SensorEventHandler>()
  private readonly policy: ReconnectPolicy
  private readonly sleep: (ms: number) => Promise<void>

  constructor(protected readonly options: BaseAdapterOptions) {
    this.policy = options.reconnect ?? DEFAULT_RECONNECT_POLICY
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** 실제 통신을 시작한다. 실패하면 던진다. */
  protected abstract openConnection(): Promise<void>
  protected abstract closeConnection(): Promise<void>

  /** 장치 원본을 표준 이벤트 후보로 바꾼다. 기본은 이미 표준 모양이라고 보고 그대로 검증한다. */
  protected parseRaw(raw: unknown): unknown {
    return raw
  }

  /** 지금 실제 하드웨어와 연결되어 있는가. 시뮬레이터는 항상 false. */
  protected get realHardwareConnected(): boolean {
    return false
  }

  async connect(): Promise<void> {
    if (this.state === 'CONNECTED') return
    this.state = 'CONNECTING'
    try {
      await this.openConnection()
      this.state = 'CONNECTED'
      this.reconnectAttempts = 0
    } catch (error) {
      this.state = 'FAILED'
      this.recordError(error instanceof Error ? error.message : '연결에 실패했습니다.')
      throw error
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.closeConnection()
    } finally {
      this.state = 'DISCONNECTED'
    }
  }

  /** 연결을 끊고 정책에 따라 다시 시도한다. 모두 실패하면 FAILED 로 남고 던진다. */
  async reconnect(): Promise<void> {
    this.state = 'RECONNECTING'
    await this.closeConnection().catch(() => undefined)
    let lastError: unknown = null
    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt += 1) {
      this.reconnectAttempts = attempt
      if (attempt > 1) await this.sleep(reconnectDelayMs(this.policy, attempt - 1))
      try {
        await this.openConnection()
        this.state = 'CONNECTED'
        this.reconnectAttempts = 0
        return
      } catch (error) {
        lastError = error
        this.recordError(error instanceof Error ? error.message : '재연결에 실패했습니다.')
      }
    }
    this.state = 'FAILED'
    throw lastError instanceof Error ? lastError : new Error('재연결에 실패했습니다.')
  }

  getStatus(): SensorAdapterStatus {
    return {
      id: this.id,
      label: this.label,
      origin: this.origin,
      protocol: this.protocol,
      state: this.state,
      realHardwareConnected: this.state === 'CONNECTED' && this.realHardwareConnected,
      lastEventAt: this.lastEventAt?.toISOString() ?? null,
      errorCount: this.errorCount,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
    }
  }

  subscribeEvents(handler: SensorEventHandler): Unsubscribe {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  normalizeEvent(raw: unknown, receivedAt: Date): NormalizeResult {
    return normalizeCandidate(this.parseRaw(raw), receivedAt)
  }

  /**
   * 하위 클래스가 장치에서 신호를 받을 때마다 부른다.
   * 정규화에 실패한 신호는 구독자에게 보내지 않고 오류로 집계한다. 구독자의 실패는 어댑터를 멈추지 않는다.
   */
  protected async receive(raw: unknown): Promise<NormalizeResult> {
    const receivedAt = this.options.now()
    const result = this.normalizeEvent(raw, receivedAt)
    if (!result.ok) {
      this.recordError(result.message)
      this.options.logger.warn({ adapter: this.id, reason: result.reason }, '센서 신호 정규화 실패')
      return result
    }
    this.lastEventAt = receivedAt
    for (const handler of [...this.handlers]) {
      try {
        await handler(result.event)
      } catch (error) {
        this.recordError('신호 처리 중 오류가 발생했습니다.')
        this.options.logger.error({ err: error, adapter: this.id }, '센서 이벤트 구독자 오류')
      }
    }
    return result
  }

  protected recordError(message: string): void {
    this.errorCount += 1
    this.lastError = message.slice(0, 200)
  }
}
