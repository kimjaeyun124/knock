import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { MONITORING_HEADLINE } from './deriveOverallStatus'
import { OverallStatus } from './OverallStatus'
import type { OverallLevel } from './deriveOverallStatus'

const LABELS: Record<OverallLevel, string> = {
  monitoring: '정상',
  incomplete: '주의',
  attention: '확인 필요',
  urgent: '확인 필요',
  disconnected: '연결 끊김',
  unknown: '상태 확인 불가',
}

describe('OverallStatus', () => {
  it.each(Object.entries(LABELS))('%s 은(는) 글자와 아이콘으로 표시한다', (level, label) => {
    const { container } = render(
      <OverallStatus
        model={{ level: level as OverallLevel, headline: '본문 문장', reasons: [] }}
      />,
    )
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText('본문 문장')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('긴급은 "즉시 확인 권장"을 함께 표시한다', () => {
    render(<OverallStatus model={{ level: 'urgent', headline: '문장', reasons: [] }} />)
    expect(screen.getByText('즉시 확인 권장')).toBeInTheDocument()
  })

  it('마지막 업데이트 시각을 보여 주고, 시각이 없으면 확인하지 못했다고 쓴다', () => {
    const { rerender } = render(
      <OverallStatus
        model={{ level: 'monitoring', headline: '문장', reasons: [] }}
        updatedAt="2026-11-13T15:00:00.000Z"
      />,
    )
    expect(screen.getByText(/마지막 업데이트:/)).toHaveTextContent('11월 14일')
    rerender(<OverallStatus model={{ level: 'monitoring', headline: '문장', reasons: [] }} />)
    expect(screen.getByText(/확인하지 못했습니다/)).toBeInTheDocument()
  })

  it('정상이어도 안전을 보장하는 표현을 쓰지 않는다', () => {
    const { container } = render(
      <OverallStatus model={{ level: 'monitoring', headline: MONITORING_HEADLINE, reasons: [] }} />,
    )
    for (const phrase of FORBIDDEN_PHRASES) expect(container.textContent).not.toContain(phrase)
    expect(container).toHaveTextContent('안전을 보장하는 것은 아닙니다')
  })

  it('긴급·연결 끊김은 스크린리더가 바로 읽도록 alert, 나머지는 status 이다', () => {
    const { rerender } = render(
      <OverallStatus model={{ level: 'urgent', headline: '문장', reasons: [] }} />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<OverallStatus model={{ level: 'disconnected', headline: '문장', reasons: [] }} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<OverallStatus model={{ level: 'monitoring', headline: '문장', reasons: [] }} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('모니터링이 온전하지 않은 이유를 목록으로 함께 보여 준다', () => {
    render(
      <OverallStatus
        model={{
          level: 'urgent',
          headline: '현관 근처에서 움직임이 감지되었습니다',
          reasons: ['센서 1개의 연결이 끊겨 있습니다.', '센서 1개의 배터리가 부족합니다.'],
        }}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
