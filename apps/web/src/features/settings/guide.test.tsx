import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DETECTION_SETTINGS,
  FORBIDDEN_PHRASES,
  REPEATED_MIN_GAP_SECONDS,
  REPEATED_THRESHOLD,
} from '@tetris/shared'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const settings = (overrides: Record<string, unknown> = {}) => ({
  ...DEFAULT_DETECTION_SETTINGS,
  updatedAt: '2026-11-18T00:00:00.000Z',
  ...overrides,
})

function show(body: Record<string, unknown>) {
  stubApi({
    ...loggedInHandlers(),
    'GET /api/settings/detection': () => jsonResponse(body),
  })
  renderApp('/settings/guide')
}

describe('감지 안내 화면', () => {
  it('내 설정과 감지하는 것·감지하지 못하는 것을 보여 준다', async () => {
    show(settings({ sensitivity: 'HIGH', sequenceWindowMinutes: 15, nightStart: '23:00' }))
    expect(await screen.findByRole('heading', { name: '감지 안내' })).toBeInTheDocument()
    expect(await screen.findByText('매일 23:00 ~ 06:00')).toBeInTheDocument()
    expect(screen.getByText('높음')).toBeInTheDocument()
    expect(screen.getByText('15분')).toBeInTheDocument()

    expect(screen.getByText('현관 근처 움직임')).toBeInTheDocument()
    expect(screen.getByText('침대 주변 움직임')).toBeInTheDocument()
    expect(screen.getByText('감지하지 못하는 것')).toBeInTheDocument()
    expect(screen.getByText(/침대 옆 센서 하나로는 알 수 없습니다/)).toBeInTheDocument()
    // 내 설정의 시간 창이 설명에 반영된다
    expect(screen.getByText(/침대 주변 신호 뒤 15분 안에/)).toBeInTheDocument()
  })

  it('반복 이동 기준 횟수와 최소 간격은 서버 규칙과 같은 공유 상수를 쓴다', async () => {
    show(settings())
    const { LOW, MEDIUM, HIGH } = REPEATED_THRESHOLD
    expect(
      await screen.findByText(
        new RegExp(`낮음 ${LOW}번 / 보통 ${MEDIUM}번 / 높음 ${HIGH}번 이상이면 알립니다`),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`${REPEATED_MIN_GAP_SECONDS}초 이상 떨어져`)),
    ).toBeInTheDocument()
  })

  it('모니터링이 꺼져 있으면 꺼져 있다고 알린다', async () => {
    show(settings({ monitoringEnabled: false }))
    expect(
      await screen.findByText(/꺼짐 \(움직임은 기록만 하고 알리지 않습니다\)/),
    ).toBeInTheDocument()
  })

  it('정확도(%)를 표시하지 않고 검증되지 않았다고 밝힌다', async () => {
    show(settings())
    expect(await screen.findByText('정확도는 검증되지 않았습니다')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+\s*%/)
  })

  it('단정적·의학적 표현을 쓰지 않는다', async () => {
    show(settings())
    await screen.findByText('감지하지 못하는 것')
    const text = document.body.textContent ?? ''
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(text, phrase).not.toContain(phrase)
    }
  })

  it('설정을 불러오지 못하면 지어내지 않고 오류를 보이되, 감지하지 못하는 것 안내는 그대로 보인다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/settings/detection': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/settings/guide')
    expect(await screen.findByText('설정을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.getByText('감지하지 못하는 것')).toBeInTheDocument()
    expect(screen.queryByText('매일 22:00 ~ 06:00')).not.toBeInTheDocument()
  })

  it('설정 화면의 "그 밖의 설정"에서 열 수 있다', async () => {
    stubApi({
      ...loggedInHandlers(),
    })
    renderApp('/settings')
    expect(await screen.findByRole('link', { name: /감지 안내/ })).toHaveAttribute(
      'href',
      '/settings/guide',
    )
  })
})
