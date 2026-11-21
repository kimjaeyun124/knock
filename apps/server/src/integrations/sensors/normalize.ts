import {
  StandardDeviceIdSchema,
  StandardEventIdSchema,
  StandardEventTypeSchema,
  StandardSensorEventSchema,
} from '@tetris/shared'
import type { NormalizeResult } from './types'

/** 어댑터가 장치 원본에서 뽑아낸 값(아직 검증 전). 필드 이름이 달라도 어댑터가 이 모양으로 맞춰 준다. */
export interface RawCandidate {
  eventId?: unknown
  deviceId?: unknown
  eventType?: unknown
  /** ISO 문자열, 밀리초 숫자, Date 중 하나. 없으면 받은 시각을 쓴다(시계가 없는 장치). */
  occurredAt?: unknown
  payload?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toIso(value: unknown, fallback: Date): string | null {
  if (value === undefined || value === null) return fallback.toISOString()
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null
  return date !== null && Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/**
 * 장치 원본 값을 표준 센서 이벤트로 검증·정규화한다. 던지지 않고 이유를 돌려준다.
 * 시간대 규칙(너무 오래됨·미래)은 여기서 보지 않는다. 수집 서비스가 모든 경로에 같은 기준으로 적용한다.
 */
export function normalizeCandidate(raw: unknown, receivedAt: Date): NormalizeResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'NOT_AN_OBJECT', message: '신호가 객체 형태가 아닙니다.' }
  }
  const candidate: RawCandidate = raw

  if (candidate.eventId === undefined || candidate.eventId === null || candidate.eventId === '') {
    return { ok: false, reason: 'MISSING_EVENT_ID', message: '이벤트 ID가 없습니다.' }
  }
  const eventId = StandardEventIdSchema.safeParse(candidate.eventId)
  if (!eventId.success) {
    return { ok: false, reason: 'INVALID_EVENT_ID', message: '이벤트 ID 형식이 올바르지 않습니다.' }
  }

  if (
    candidate.deviceId === undefined ||
    candidate.deviceId === null ||
    candidate.deviceId === ''
  ) {
    return { ok: false, reason: 'MISSING_DEVICE_ID', message: '장치 번호가 없습니다.' }
  }
  const deviceId = StandardDeviceIdSchema.safeParse(candidate.deviceId)
  if (!deviceId.success) {
    return {
      ok: false,
      reason: 'INVALID_DEVICE_ID',
      message: '장치 번호 형식이 올바르지 않습니다.',
    }
  }

  const eventType = StandardEventTypeSchema.safeParse(candidate.eventType)
  if (!eventType.success) {
    return { ok: false, reason: 'UNKNOWN_EVENT_TYPE', message: '알 수 없는 신호 종류입니다.' }
  }

  const occurredAt = toIso(candidate.occurredAt, receivedAt)
  if (occurredAt === null) {
    return { ok: false, reason: 'INVALID_TIMESTAMP', message: '발생 시각을 읽을 수 없습니다.' }
  }

  const parsed = StandardSensorEventSchema.safeParse({
    eventId: eventId.data,
    deviceId: deviceId.data,
    eventType: eventType.data,
    occurredAt,
    receivedAt: receivedAt.toISOString(),
    payload: candidate.payload ?? {},
  })
  if (!parsed.success) {
    return { ok: false, reason: 'INVALID_PAYLOAD', message: '신호 내용이 올바르지 않습니다.' }
  }
  return { ok: true, event: parsed.data }
}
