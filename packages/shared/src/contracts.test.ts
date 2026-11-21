import { describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  DEFAULT_DETECTION_SETTINGS,
  DetectionSettingsInputSchema,
  HealthResponseSchema,
  LoginRequestSchema,
  ServerReadyPayloadSchema,
} from './index'

describe('HealthResponseSchema', () => {
  const valid = {
    status: 'ok',
    service: 'tetris-server',
    version: '0.1.0',
    timestamp: '2026-11-13T03:00:00.000Z',
    uptimeSeconds: 12.5,
    checks: { database: 'up' },
  }

  it('올바른 응답을 통과시킨다', () => {
    expect(HealthResponseSchema.safeParse(valid).success).toBe(true)
  })

  it('status가 ok가 아니면 거부한다', () => {
    expect(HealthResponseSchema.safeParse({ ...valid, status: 'degraded' }).success).toBe(false)
  })

  it('DB 점검 결과가 없거나 up 이 아니면 거부한다', () => {
    expect(HealthResponseSchema.safeParse({ ...valid, checks: {} }).success).toBe(false)
    expect(HealthResponseSchema.safeParse({ ...valid, checks: { database: 'down' } }).success).toBe(
      false,
    )
  })

  it('필드가 빠진 응답(예: 프록시가 돌려준 빈 객체)을 거부한다', () => {
    expect(HealthResponseSchema.safeParse({}).success).toBe(false)
  })
})

describe('ApiErrorBodySchema', () => {
  it('서버 오류 본문을 해석한다', () => {
    const result = ApiErrorBodySchema.safeParse({
      error: { code: 'NOT_FOUND', message: '찾을 수 없습니다.', requestId: 'abc' },
    })
    expect(result.success).toBe(true)
  })

  it('error 객체가 없으면 거부한다', () => {
    expect(ApiErrorBodySchema.safeParse({ message: 'x' }).success).toBe(false)
  })
})

describe('ServerReadyPayloadSchema', () => {
  it('ISO 시각이 아니면 거부한다', () => {
    expect(ServerReadyPayloadSchema.safeParse({ serverTime: 'yesterday' }).success).toBe(false)
  })
})

describe('LoginRequestSchema', () => {
  it('이메일을 소문자로 바꾸고 앞뒤 공백을 지운다', () => {
    const parsed = LoginRequestSchema.parse({ email: '  Guardian@Example.COM ', password: 'x' })
    expect(parsed.email).toBe('guardian@example.com')
  })

  it('이메일 형식이 아니거나 비밀번호가 비었거나 너무 길면 거부한다', () => {
    expect(LoginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false)
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(201) }).success,
    ).toBe(false)
  })
})

describe('DetectionSettingsInputSchema', () => {
  it('기본 설정은 스스로 유효하다', () => {
    expect(DetectionSettingsInputSchema.safeParse(DEFAULT_DETECTION_SETTINGS).success).toBe(true)
  })

  it('자정을 넘는 야간 구간(22:00–06:00)을 허용한다', () => {
    const result = DetectionSettingsInputSchema.safeParse({
      ...DEFAULT_DETECTION_SETTINGS,
      nightStart: '22:00',
      nightEnd: '06:00',
    })
    expect(result.success).toBe(true)
  })

  it.each([
    ['시작과 종료가 같음', { nightEnd: '22:00' }],
    ['24:00 은 없는 시각', { nightStart: '24:00' }],
    ['위급 배터리가 부족 기준 이상', { criticalBatteryPercent: 20 }],
    ['민감도 오타', { sensitivity: 'high' }],
  ])('거부: %s', (_name, override) => {
    const result = DetectionSettingsInputSchema.safeParse({
      ...DEFAULT_DETECTION_SETTINGS,
      ...override,
    })
    expect(result.success).toBe(false)
  })
})
