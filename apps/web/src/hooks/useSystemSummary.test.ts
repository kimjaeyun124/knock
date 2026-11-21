import { describe, expect, it } from 'vitest'
import { makeAlert, makeSensor } from '@/test/fixtures'
import { countDeliveryFailures, summarizeSensors } from './useSystemSummary'

describe('summarizeSensors', () => {
  it('사용 중인 센서만 세고 끊김·첫 신호 대기·시뮬레이션을 구분한다', () => {
    const summary = summarizeSensors([
      makeSensor({ id: '1' }),
      makeSensor({ id: '2', state: 'OFFLINE' }),
      makeSensor({ id: '3', state: 'PENDING' }),
      makeSensor({ id: '4', origin: 'SIMULATED' }),
      makeSensor({ id: '5', isActive: false, state: 'DISABLED' }),
    ])
    expect(summary).toEqual({ active: 4, offline: 1, pending: 1, simulated: 1 })
  })
})

describe('countDeliveryFailures', () => {
  it('전달 실패 알림만 센다', () => {
    expect(
      countDeliveryFailures([
        makeAlert({ id: '1', type: 'DELIVERY_FAILED' }),
        makeAlert({ id: '2' }),
        makeAlert({ id: '3', type: 'DELIVERY_FAILED' }),
      ]),
    ).toBe(2)
  })
})
