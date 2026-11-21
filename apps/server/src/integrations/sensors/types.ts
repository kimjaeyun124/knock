import type {
  AdapterState,
  DataOrigin,
  GatewayResult,
  NormalizeFailureReason,
  SensorAdapterStatus,
  StandardSensorEvent,
} from '@tetris/shared'

export type NormalizeResult =
  | { ok: true; event: StandardSensorEvent }
  | { ok: false; reason: NormalizeFailureReason; message: string }

export type SensorEventHandler = (event: StandardSensorEvent) => Promise<void> | void
export type Unsubscribe = () => void

/**
 * 센서 통신 어댑터. 시뮬레이터와 (앞으로의) 실제 하드웨어가 같은 모양으로 신호를 서버에 들여보낸다.
 *
 * - 어댑터는 통신(연결·재연결·장치별 형식 읽기)만 맡고, 판단(감지 규칙·알림)은 하지 않는다.
 * - 신호는 normalizeEvent 로 표준 이벤트가 된 뒤에만 구독자에게 전달된다.
 * - 실제 장치와 연결되지 않았으면 getStatus().realHardwareConnected 는 false 이며, 연결된 것처럼 보이지 않는다.
 */
export interface SensorAdapter {
  readonly id: string
  readonly label: string
  /** 이 어댑터가 들여보내는 신호의 출처 */
  readonly origin: DataOrigin
  /** 통신 방식(HTTP·MQTT 등). 정해지지 않았으면 null */
  readonly protocol: string | null

  connect(): Promise<void>
  disconnect(): Promise<void>
  /** 끊어진 연결을 다시 맺는다. (재시도 횟수·간격은 어댑터의 ReconnectPolicy) */
  reconnect(): Promise<void>
  getStatus(): SensorAdapterStatus
  /** 정규화된 이벤트를 받는다. 반환 함수로 구독을 해제한다. */
  subscribeEvents(handler: SensorEventHandler): Unsubscribe
  /** 장치가 보낸 원본 신호를 표준 이벤트로 바꾼다. 형식이 틀리면 ok:false 와 이유를 돌려준다(던지지 않는다). */
  normalizeEvent(raw: unknown, receivedAt: Date): NormalizeResult
}

/** 재연결 간격 정책. 지수적으로 늘리되 상한을 둔다. */
export interface ReconnectPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
}

export function reconnectDelayMs(policy: ReconnectPolicy, attempt: number): number {
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1))
}

export type { AdapterState, GatewayResult }
