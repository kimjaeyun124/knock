import { describe, expect, it } from 'vitest'
import {
  EventsQuerySchema,
  HeartbeatRequestSchema,
  INGEST_LIMITS,
  IngestEventsRequestSchema,
  SensorCreateSchema,
  SensorUpdateSchema,
} from './index'

describe('SensorCreateSchema / SensorUpdateSchema', () => {
  it('이름의 앞뒤 공백을 지우고, 빈 이름과 51자 이상은 거부한다', () => {
    expect(SensorCreateSchema.parse({ name: '  안방  ', zone: 'BED_SIDE' }).name).toBe('안방')
    expect(SensorCreateSchema.safeParse({ name: '   ', zone: 'PATH' }).success).toBe(false)
    expect(SensorCreateSchema.safeParse({ name: 'x'.repeat(51), zone: 'PATH' }).success).toBe(false)
  })

  it('등록 요청의 알 수 없는 항목(origin 등)은 버린다', () => {
    const parsed = SensorCreateSchema.parse({ name: 's', zone: 'PATH', origin: 'SIMULATED' })
    expect(parsed).toEqual({ name: 's', zone: 'PATH' })
  })

  it('수정 요청은 항목이 하나도 없으면 거부하고, 하나만 있어도 받는다', () => {
    expect(SensorUpdateSchema.safeParse({}).success).toBe(false)
    expect(SensorUpdateSchema.safeParse({ isActive: false }).success).toBe(true)
  })
})

describe('IngestEventsRequestSchema', () => {
  const event = { eventId: 'a1b2c3d4-e5f6', type: 'MOTION' }

  it('발생 시각은 생략하거나 ISO(오프셋 포함)로 보낼 수 있다', () => {
    expect(IngestEventsRequestSchema.safeParse({ events: [event] }).success).toBe(true)
    expect(
      IngestEventsRequestSchema.safeParse({
        events: [{ ...event, occurredAt: '2026-11-14T10:00:00+09:00' }],
      }).success,
    ).toBe(true)
    expect(
      IngestEventsRequestSchema.safeParse({
        events: [{ ...event, occurredAt: '2026-11-14 10:00' }],
      }).success,
    ).toBe(false)
  })

  it(`한 번에 1~${INGEST_LIMITS.maxEventsPerRequest}건`, () => {
    expect(IngestEventsRequestSchema.safeParse({ events: [] }).success).toBe(false)
    const many = (n: number) => ({
      events: Array.from({ length: n }, (_, i) => ({ ...event, eventId: `evt-${i + 10000}` })),
    })
    expect(IngestEventsRequestSchema.safeParse(many(100)).success).toBe(true)
    expect(IngestEventsRequestSchema.safeParse(many(101)).success).toBe(false)
  })

  it('이벤트 ID 는 8~64자의 영문·숫자·-·_ 만 허용한다', () => {
    for (const eventId of ['short', 'has space here', 'emoji-😀-id-00', 'x'.repeat(65)]) {
      expect(
        IngestEventsRequestSchema.safeParse({ events: [{ ...event, eventId }] }).success,
        eventId,
      ).toBe(false)
    }
  })
})

describe('HeartbeatRequestSchema', () => {
  it('아무것도 없어도 되고, 배터리는 0~100 정수여야 한다', () => {
    expect(HeartbeatRequestSchema.safeParse({}).success).toBe(true)
    expect(HeartbeatRequestSchema.safeParse({ batteryPercent: 0 }).success).toBe(true)
    expect(HeartbeatRequestSchema.safeParse({ batteryPercent: 100 }).success).toBe(true)
    for (const batteryPercent of [-1, 101, 50.5, '50']) {
      expect(HeartbeatRequestSchema.safeParse({ batteryPercent }).success).toBe(false)
    }
  })
})

describe('EventsQuerySchema', () => {
  it('limit 기본값 50, 문자열 숫자를 변환하고 200 을 넘으면 거부한다', () => {
    expect(EventsQuerySchema.parse({}).limit).toBe(50)
    expect(EventsQuerySchema.parse({ limit: '25' }).limit).toBe(25)
    expect(EventsQuerySchema.safeParse({ limit: '201' }).success).toBe(false)
  })
})
