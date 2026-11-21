import { describe, expect, it } from 'vitest'
import {
  CHANNEL_LABELS,
  FORBIDDEN_PHRASES,
  INTEGRATION_MODE_LABELS,
  SENSOR_STATE_LABELS,
  ZONE_LABELS,
} from '@tetris/shared'
import {
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  DELIVERY_STATUS_LABELS,
  PROVIDER_MODE_LABELS,
  RESOLUTION_LABELS,
  BATTERY_LABELS,
  ORIGIN_LABELS,
  SAMPLE_DATA_LABEL,
  SAMPLE_DATA_NOTICE,
  SEVERITY_LABELS,
  TIMELINE_ATTENTION_LABELS,
  TIMELINE_TYPE_LABELS,
} from './labels'

describe('화면 문구 정책', () => {
  const all = [
    ...Object.values(SEVERITY_LABELS),
    ...Object.values(ALERT_TYPE_LABELS),
    ...Object.values(ALERT_STATUS_LABELS),
    ...Object.values(RESOLUTION_LABELS),
    ...Object.values(DELIVERY_STATUS_LABELS),
    ...Object.values(PROVIDER_MODE_LABELS),
    ...Object.values(BATTERY_LABELS),
    ...Object.values(ORIGIN_LABELS),
    ...Object.values(CHANNEL_LABELS),
    ...Object.values(INTEGRATION_MODE_LABELS),
    ...Object.values(SENSOR_STATE_LABELS),
    ...Object.values(ZONE_LABELS),
    ...Object.values(TIMELINE_TYPE_LABELS),
    ...Object.values(TIMELINE_ATTENTION_LABELS),
    SAMPLE_DATA_LABEL,
    SAMPLE_DATA_NOTICE,
  ]

  it('확정적·의학적 표현(낙상, 배회, 안전합니다 등)을 쓰지 않는다', () => {
    for (const text of all) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(text, `"${text}" 에 금지 표현 "${phrase}"`).not.toContain(phrase)
      }
    }
  })

  it('모든 문구가 비어 있지 않다', () => {
    for (const text of all) expect(text.trim()).not.toBe('')
  })
})
