import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ALERT_SEVERITIES,
  BATTERY_LEVELS,
  INTEGRATION_MODES,
  SENSOR_STATES,
  SENSOR_STATE_LABELS,
  INTEGRATION_MODE_LABELS,
} from '@tetris/shared'
import { SEVERITY_LABELS } from '@/lib/labels'
import {
  BatteryBadge,
  DataOriginBadge,
  IntegrationModeBadge,
  SampleBadge,
  SensorStateBadge,
  SeverityBadge,
} from './DomainBadges'

/** 상태는 색만으로 전달하지 않는다: 글자와 아이콘이 모두 있어야 한다. */
function expectTextAndIcon(text: string) {
  const label = screen.getByText(text)
  const badge = label.parentElement as HTMLElement
  expect(badge.querySelector('svg')).not.toBeNull()
  expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
}

describe('도메인 상태 배지', () => {
  it.each(ALERT_SEVERITIES)('알림 수준 %s 은(는) 글자와 아이콘으로 표시한다', (severity) => {
    render(<SeverityBadge severity={severity} />)
    expectTextAndIcon(SEVERITY_LABELS[severity])
  })

  it.each(SENSOR_STATES)('센서 상태 %s 은(는) 글자와 아이콘으로 표시한다', (state) => {
    render(<SensorStateBadge state={state} />)
    expectTextAndIcon(SENSOR_STATE_LABELS[state])
  })

  it.each(INTEGRATION_MODES)('연동 방식 %s 은(는) 글자와 아이콘으로 표시한다', (mode) => {
    render(<IntegrationModeBadge mode={mode} />)
    expectTextAndIcon(INTEGRATION_MODE_LABELS[mode])
  })

  it('긴급은 "즉시 확인 권장", 연결 끊김은 "연결 끊김"이라고 쓴다', () => {
    render(
      <>
        <SeverityBadge severity="URGENT" />
        <SensorStateBadge state="OFFLINE" />
      </>,
    )
    expect(screen.getByText('즉시 확인 권장')).toBeInTheDocument()
    expect(screen.getByText('연결 끊김')).toBeInTheDocument()
  })

  it.each(BATTERY_LEVELS)('배터리 %s 은(는) 아이콘과 함께 표시한다', (level) => {
    const { container } = render(
      <BatteryBadge level={level} percent={level === 'UNKNOWN' ? null : 15} />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('배터리 정보가 없으면 퍼센트를 지어내지 않는다', () => {
    render(<BatteryBadge level="UNKNOWN" percent={null} />)
    expect(screen.getByText('배터리 정보 없음')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('배터리 수준과 퍼센트를 함께 보여 준다', () => {
    render(<BatteryBadge level="LOW" percent={18} />)
    expect(screen.getByText('배터리 부족 (18%)')).toBeInTheDocument()
  })

  it('시뮬레이션 데이터는 실제 센서와 구분되어 표시된다', () => {
    render(
      <>
        <DataOriginBadge origin="SIMULATED" />
        <DataOriginBadge origin="REAL" />
      </>,
    )
    expect(screen.getByText('시뮬레이션')).toBeInTheDocument()
    expect(screen.getByText('실제 센서')).toBeInTheDocument()
  })

  it('샘플 데이터 배지가 있다', () => {
    render(<SampleBadge />)
    expectTextAndIcon('샘플 데이터')
  })
})
