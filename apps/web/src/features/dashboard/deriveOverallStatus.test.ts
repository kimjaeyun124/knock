import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { makeAlert, makeSensor } from '@/test/fixtures'
import {
  deriveOverallStatus,
  MONITORING_HEADLINE,
  unavailableStatus,
  unknownOverallStatus,
  OVERALL_LEVEL_LABELS,
} from './deriveOverallStatus'

const online = [makeSensor({ id: 's1' }), makeSensor({ id: 's2', zone: 'PATH' })]

describe('deriveOverallStatus', () => {
  it('센서가 모두 연결되어 있고 알림이 없으면 모니터링 중이다', () => {
    expect(deriveOverallStatus(online, [])).toEqual({
      level: 'monitoring',
      headline: MONITORING_HEADLINE,
      reasons: [],
    })
  })

  it('사용 중인 센서가 하나도 없으면 "모니터링 중"이 아니다', () => {
    const none = deriveOverallStatus([], [])
    expect(none.level).toBe('incomplete')
    expect(none.headline).toContain('사용 중인 센서가 없어')
    const allDisabled = deriveOverallStatus(
      [makeSensor({ isActive: false, state: 'DISABLED' })],
      [],
    )
    expect(allDisabled.level).toBe('incomplete')
  })

  it('긴급 알림이 열려 있으면 긴급이며 알림 제목을 그대로 쓴다', () => {
    const status = deriveOverallStatus(online, [makeAlert()])
    expect(status.level).toBe('urgent')
    expect(status.headline).toBe('현관 근처에서 움직임이 감지되었습니다')
  })

  it('주의 알림만 있으면 확인 필요이다', () => {
    const status = deriveOverallStatus(online, [
      makeAlert({
        type: 'BED_TO_PATH',
        severity: 'NOTICE',
        title: '침대 주변에서 이동 경로로 움직임이 이어졌습니다',
      }),
    ])
    expect(status.level).toBe('attention')
  })

  it('긴급과 주의가 함께 있으면 긴급이 이긴다', () => {
    const status = deriveOverallStatus(online, [
      makeAlert({ id: 'n', type: 'BED_TO_PATH', severity: 'NOTICE' }),
      makeAlert({ id: 'u' }),
    ])
    expect(status.level).toBe('urgent')
  })

  it('같은 수준이면 더 최근 알림의 제목을 쓴다', () => {
    const status = deriveOverallStatus(online, [
      makeAlert({ id: 'old', title: '이전 알림', triggeredAt: '2026-11-13T15:00:00.000Z' }),
      makeAlert({ id: 'new', title: '최근 알림', triggeredAt: '2026-11-13T15:30:00.000Z' }),
    ])
    expect(status.headline).toBe('최근 알림')
  })

  it('이미 확인한 알림은 "열린 알림"으로 세지 않는다', () => {
    const status = deriveOverallStatus(online, [makeAlert({ status: 'ACKNOWLEDGED' })])
    expect(status.level).toBe('monitoring')
  })

  it('연결이 끊긴 센서가 있으면 모니터링 불완전이다', () => {
    const status = deriveOverallStatus(
      [makeSensor(), makeSensor({ id: 's2', state: 'OFFLINE' })],
      [],
    )
    expect(status).toMatchObject({
      level: 'incomplete',
      headline: '센서 1개의 연결이 끊겨 있습니다.',
    })
  })

  it('알림이 열려 있어도 모니터링이 온전하지 않은 이유를 함께 돌려준다', () => {
    const status = deriveOverallStatus(
      [
        makeSensor({ state: 'OFFLINE' }),
        makeSensor({ id: 's2', batteryLevel: 'LOW', batteryPercent: 12 }),
      ],
      [
        makeAlert(),
        makeAlert({
          id: 'd',
          type: 'DELIVERY_FAILED',
          severity: 'URGENT',
          title: '알림을 전달하지 못했습니다',
        }),
      ],
    )
    expect(status.level).toBe('urgent')
    expect(status.reasons).toEqual([
      '센서 1개의 연결이 끊겨 있습니다.',
      '센서 1개의 배터리가 부족합니다.',
      '보호자에게 알림을 전달하지 못한 기록이 있습니다.',
    ])
  })

  it('첫 신호를 기다리는 센서가 있으면 연결을 확인한 것이 아니므로 불완전이다', () => {
    const status = deriveOverallStatus([makeSensor({ state: 'PENDING', lastSeenAt: null })], [])
    expect(status.level).toBe('incomplete')
    expect(status.headline).toContain('첫 신호')
  })

  it('비활성 센서의 상태는 세지 않는다', () => {
    const status = deriveOverallStatus(
      [
        makeSensor(),
        makeSensor({ id: 's2', isActive: false, state: 'DISABLED', batteryLevel: 'CRITICAL' }),
      ],
      [],
    )
    expect(status.level).toBe('monitoring')
  })

  it('전달 실패 알림만 있어도 불완전으로 표시한다 (알림 수준은 움직임 알림만 센다)', () => {
    const status = deriveOverallStatus(online, [
      makeAlert({
        type: 'DELIVERY_FAILED',
        severity: 'URGENT',
        title: '알림을 전달하지 못했습니다',
      }),
    ])
    expect(status.level).toBe('incomplete')
  })

  it('확인하지 못한 상태는 정상처럼 보이지 않는 별도 수준이다', () => {
    expect(unknownOverallStatus('센서 상태를 확인하지 못했습니다.')).toEqual({
      level: 'unknown',
      headline: '센서 상태를 확인하지 못했습니다.',
      reasons: [],
    })
  })

  it('확인에 실패해도 이전 상태는 "마지막으로 확인한 상태"로만 덧붙인다', () => {
    const lastKnown = deriveOverallStatus(online, [makeAlert()])
    const status = unknownOverallStatus('센서 상태를 확인하지 못했습니다.', lastKnown)
    expect(status.level).toBe('unknown')
    expect(status.headline).toBe('센서 상태를 확인하지 못했습니다.')
    expect(status.reasons).toEqual([
      '마지막으로 확인한 상태: 즉시 확인 권장 — 현관 근처에서 움직임이 감지되었습니다',
    ])
  })

  it('이전 상태가 확인 불가였다면 덧붙이지 않는다', () => {
    const status = unknownOverallStatus('다시 실패', unknownOverallStatus('처음 실패'))
    expect(status.reasons).toEqual([])
  })

  it('만들어 내는 문구에 금지 표현이 없다', () => {
    const samples = [
      deriveOverallStatus([], []),
      deriveOverallStatus(online, []),
      deriveOverallStatus(
        [
          makeSensor({ state: 'OFFLINE' }),
          makeSensor({ id: 'p', state: 'PENDING' }),
          makeSensor({ id: 'b', batteryLevel: 'CRITICAL' }),
        ],
        [makeAlert({ type: 'DELIVERY_FAILED' })],
      ),
    ]
    const text = samples.flatMap((s) => [s.headline, ...s.reasons]).join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
  })

  it('사용 중인 센서가 모두 끊겨 있으면 "연결 끊김"이다 (일부만 끊기면 "주의")', () => {
    const all = deriveOverallStatus(
      [makeSensor({ state: 'OFFLINE' }), makeSensor({ id: 's2', state: 'OFFLINE' })],
      [],
    )
    expect(all).toMatchObject({
      level: 'disconnected',
      headline: '사용 중인 모든 센서의 연결이 끊겨 있습니다.',
    })
    expect(OVERALL_LEVEL_LABELS[all.level]).toBe('연결 끊김')
    const some = deriveOverallStatus([makeSensor(), makeSensor({ id: 's2', state: 'OFFLINE' })], [])
    expect(some.level).toBe('incomplete')
    expect(OVERALL_LEVEL_LABELS[some.level]).toBe('주의')
  })

  it('끊긴 센서 알림이 있어도 움직임 알림이 있으면 알림 수준이 먼저다', () => {
    const status = deriveOverallStatus([makeSensor({ state: 'OFFLINE' })], [makeAlert()])
    expect(status.level).toBe('urgent')
    expect(status.reasons).toContain('센서 1개의 연결이 끊겨 있습니다.')
  })

  it('연결 끊김으로 알릴 때도 이전 상태는 "마지막으로 확인한 상태"로만 덧붙이고, 긴급은 긴급이라고 남긴다', () => {
    const lastKnown = deriveOverallStatus(online, [makeAlert()])
    const status = unavailableStatus('disconnected', '인터넷 연결이 끊겨 있습니다.', lastKnown)
    expect(status.level).toBe('disconnected')
    expect(status.reasons).toEqual([
      '마지막으로 확인한 상태: 즉시 확인 권장 — 현관 근처에서 움직임이 감지되었습니다',
    ])
    const normal = unavailableStatus('disconnected', '끊김', deriveOverallStatus(online, []))
    expect(normal.reasons[0]).toContain('마지막으로 확인한 상태: 정상')
  })

  it('요구된 네 가지 이름(정상·주의·확인 필요·연결 끊김)을 쓴다', () => {
    expect(OVERALL_LEVEL_LABELS.monitoring).toBe('정상')
    expect(OVERALL_LEVEL_LABELS.incomplete).toBe('주의')
    expect(OVERALL_LEVEL_LABELS.attention).toBe('확인 필요')
    expect(OVERALL_LEVEL_LABELS.urgent).toBe('확인 필요')
    expect(OVERALL_LEVEL_LABELS.disconnected).toBe('연결 끊김')
  })
})
