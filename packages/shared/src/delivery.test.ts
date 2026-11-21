import { describe, expect, it } from 'vitest'
import { CHANNELS, DELIVERY_STATUSES, aggregateDeliveryState, classifyDelivery } from './index'

describe('classifyDelivery: 전달 기록 하나의 화면용 상태', () => {
  it('아직 보내지 않았으면 대기, 시도했으면 전송 시도이다', () => {
    expect(classifyDelivery({ channel: 'IN_APP', status: 'PENDING', attempts: 0 })).toBe('WAITING')
    expect(classifyDelivery({ channel: 'IN_APP', status: 'PENDING', attempts: 1 })).toBe(
      'ATTEMPTING',
    )
  })

  it('앱 화면 알림만 "전송 성공"이고, 푸시·문자·카카오는 기기 수신을 확인할 수 없어 "전달 확인 불가"이다', () => {
    expect(classifyDelivery({ channel: 'IN_APP', status: 'SENT', attempts: 1 })).toBe('SENT')
    for (const channel of CHANNELS.filter((c) => c !== 'IN_APP')) {
      expect(classifyDelivery({ channel, status: 'SENT', attempts: 1 }), channel).toBe('UNVERIFIED')
    }
  })

  it('실패는 전송 실패이다', () => {
    expect(classifyDelivery({ channel: 'WEB_PUSH', status: 'FAILED', attempts: 3 })).toBe('FAILED')
  })

  it('연동되지 않았거나 확인·종료로 멈춘 전달은 상태가 없다', () => {
    expect(classifyDelivery({ channel: 'SMS', status: 'NOT_CONFIGURED', attempts: 0 })).toBeNull()
    expect(classifyDelivery({ channel: 'IN_APP', status: 'CANCELLED', attempts: 1 })).toBeNull()
  })

  it('모든 채널·상태 조합이 정해진 값 중 하나(또는 null)를 돌려준다', () => {
    for (const channel of CHANNELS) {
      for (const status of DELIVERY_STATUSES) {
        const state = classifyDelivery({ channel, status, attempts: 1 })
        expect([null, 'WAITING', 'ATTEMPTING', 'SENT', 'UNVERIFIED', 'FAILED']).toContain(state)
      }
    }
  })
})

describe('aggregateDeliveryState: 알림 하나의 대표 상태', () => {
  it('도착에 가까운 상태가 우선이다 (성공 > 확인 불가 > 시도 > 대기 > 실패)', () => {
    expect(aggregateDeliveryState(['FAILED', 'SENT'])).toBe('SENT')
    expect(aggregateDeliveryState(['FAILED', 'UNVERIFIED'])).toBe('UNVERIFIED')
    expect(aggregateDeliveryState(['WAITING', 'FAILED'])).toBe('WAITING')
    expect(aggregateDeliveryState(['ATTEMPTING', 'WAITING'])).toBe('ATTEMPTING')
    expect(aggregateDeliveryState(['FAILED'])).toBe('FAILED')
  })
  it('전달 대상이 없으면(비었거나 상태 없는 것뿐이면) null 이다', () => {
    expect(aggregateDeliveryState([])).toBeNull()
    expect(aggregateDeliveryState([null, null])).toBeNull()
  })
})
