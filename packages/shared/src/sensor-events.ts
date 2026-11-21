import { z } from './zod'
import { DataOriginSchema } from './domain'
import { INGEST_LIMITS } from './ingest'
import { DeviceIdSchema } from './sensors'

/**
 * 센서 어댑터(시뮬레이터·실제 하드웨어)가 서버 안으로 들여보내는 표준 이벤트.
 * 장치마다 다른 통신 방식·형식은 어댑터가 이 모양으로 바꾼 뒤 같은 처리 경로(수집 서비스)에 넣는다.
 * 자세한 설명은 docs/HARDWARE_INTEGRATION.md.
 */
export const STANDARD_EVENT_TYPES = ['MOTION', 'STATUS'] as const
export const StandardEventTypeSchema = z.enum(STANDARD_EVENT_TYPES)
export type StandardEventType = z.infer<typeof StandardEventTypeSchema>

export const STANDARD_EVENT_TYPE_LABELS: Record<StandardEventType, string> = {
  MOTION: '움직임 신호',
  STATUS: '상태 신호(heartbeat)',
}

/** 센서 등록 때 정하는 장치 번호(Sensor.deviceId)와 같은 규칙 */
export const StandardDeviceIdSchema = DeviceIdSchema
export const StandardEventIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)

const common = {
  /** 장치가 만드는 고유 ID. 같은 ID 는 몇 번 들어와도 한 번만 처리된다. */
  eventId: StandardEventIdSchema,
  /** 등록된 센서의 장치 번호(Sensor.deviceId). 서버가 이것으로 어느 센서인지 알아낸다. */
  deviceId: StandardDeviceIdSchema,
  /** 센서가 신호를 만든 시각. 시계가 없는 장치는 receivedAt 과 같다. */
  occurredAt: z.iso.datetime({ offset: true }),
  /** 어댑터가 신호를 받은 시각(서버 시계). */
  receivedAt: z.iso.datetime({ offset: true }),
}

export const StandardMotionEventSchema = z.object({
  ...common,
  eventType: z.literal('MOTION'),
  payload: z.object({}).strict(),
})

export const StandardStatusEventSchema = z.object({
  ...common,
  eventType: z.literal('STATUS'),
  payload: z.object({
    /** 배터리 정보를 주지 않는 센서는 생략한다. 서버는 값을 만들어 내지 않는다. */
    batteryPercent: z.number().int().min(0).max(100).optional(),
    firmware: z.string().trim().min(1).max(32).optional(),
  }),
})

export const StandardSensorEventSchema = z.discriminatedUnion('eventType', [
  StandardMotionEventSchema,
  StandardStatusEventSchema,
])
export type StandardSensorEvent = z.infer<typeof StandardSensorEventSchema>

/** 어댑터가 정규화에 실패했을 때의 이유 */
export const NORMALIZE_FAILURE_REASONS = [
  'NOT_AN_OBJECT',
  'MISSING_EVENT_ID',
  'INVALID_EVENT_ID',
  'MISSING_DEVICE_ID',
  'INVALID_DEVICE_ID',
  'UNKNOWN_EVENT_TYPE',
  'INVALID_TIMESTAMP',
  'INVALID_PAYLOAD',
] as const
export type NormalizeFailureReason = (typeof NORMALIZE_FAILURE_REASONS)[number]

/** 게이트웨이가 이벤트 하나를 처리한 결과 */
export const GATEWAY_RESULT_STATUSES = ['ACCEPTED', 'DUPLICATE', 'REJECTED', 'ERROR'] as const
export const GATEWAY_REJECT_REASONS = [
  'UNKNOWN_DEVICE',
  'SENSOR_DISABLED',
  'ORIGIN_MISMATCH',
  'FUTURE_TIMESTAMP',
  'TOO_OLD',
  'TYPE_MISMATCH',
] as const
export const GatewayResultSchema = z.object({
  eventId: z.string(),
  status: z.enum(GATEWAY_RESULT_STATUSES),
  reason: z.enum(GATEWAY_REJECT_REASONS).optional(),
})
export type GatewayResult = z.infer<typeof GatewayResultSchema>

// ───────── 어댑터 상태 ─────────

/**
 * 어댑터 연결 상태.
 * NOT_CONFIGURED: 이 어댑터에 해당하는 실제 장치·설정이 없다. (연결된 것처럼 보이지 않는다)
 */
export const ADAPTER_STATES = [
  'NOT_CONFIGURED',
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'RECONNECTING',
  'FAILED',
] as const
export const AdapterStateSchema = z.enum(ADAPTER_STATES)
export type AdapterState = z.infer<typeof AdapterStateSchema>

export const ADAPTER_STATE_LABELS: Record<AdapterState, string> = {
  NOT_CONFIGURED: '연결된 장치 없음',
  DISCONNECTED: '연결 안 됨',
  CONNECTING: '연결하는 중',
  CONNECTED: '연결됨',
  RECONNECTING: '다시 연결하는 중',
  FAILED: '연결 실패',
}

export const SensorAdapterStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** 이 어댑터가 들여보내는 신호의 출처. SIMULATED 는 실제 장치가 아니다. */
  origin: DataOriginSchema,
  /** 통신 방식(예: HTTP, MQTT). 정해지지 않았으면 null */
  protocol: z.string().nullable(),
  state: AdapterStateSchema,
  /** 실제 하드웨어와 연결되어 있는가. 시뮬레이터와 연동되지 않은 어댑터는 항상 false */
  realHardwareConnected: z.boolean(),
  lastEventAt: z.iso.datetime().nullable(),
  /** 정규화·처리에 실패한 신호 수(서버를 다시 시작하면 0부터) */
  errorCount: z.number().int().min(0),
  lastError: z.string().nullable(),
  reconnectAttempts: z.number().int().min(0),
})
export type SensorAdapterStatus = z.infer<typeof SensorAdapterStatusSchema>

/** GET /api/system/sensor-adapters */
export const SensorAdaptersResponseSchema = z.object({
  adapters: z.array(SensorAdapterStatusSchema),
})
export type SensorAdaptersResponse = z.infer<typeof SensorAdaptersResponseSchema>

/** 같은 이벤트 ID 를 중복으로 보는 기억 시간과 크기 (게이트웨이의 빠른 중복 제거용. 최종 보장은 DB) */
export const GATEWAY_DEDUPE = {
  ttlSeconds: INGEST_LIMITS.maxEventAgeHours * 3600,
  maxEntries: 5_000,
} as const

/**
 * GET /api/system/backup — 서버의 자동 데이터베이스 백업 상태.
 * `enabled: false` 는 "이 서버가 자동으로 백업하지 않는다"는 뜻이다. (운영자가 다른 방법으로 백업할 수는 있다)
 * 폴더 경로나 오류 상세는 담지 않는다.
 */
export const BackupStatusSchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).nullable(),
  keep: z.number().int().min(1).nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastFailureAt: z.iso.datetime().nullable(),
  /** 가장 최근 시도가 실패했는가 (그 뒤 성공하면 false 로 돌아온다) */
  lastRunFailed: z.boolean(),
  backupCount: z.number().int().min(0),
})
export type BackupStatus = z.infer<typeof BackupStatusSchema>
