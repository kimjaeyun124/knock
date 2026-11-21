import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeAlert } from '@/test/fixtures'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const detail = () => ({
  alert: makeAlert({ id: 'a1', origin: 'SIMULATED' }),
  evidence: [],
  deliveries: [],
})

const clip = (id: string) => ({
  id,
  alertId: 'a1',
  mimeType: 'video/webm',
  sizeBytes: 120_000,
  durationMs: 4000,
  createdAt: '2026-11-20T01:00:00.000Z',
  url: `/api/alerts/a1/clips/${id}`,
})

describe('알림 상세: 알림과 함께 온 영상', () => {
  it('영상이 있으면 재생할 수 있게 보여 주고, 보관 기간을 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/a1': () => jsonResponse(detail()),
      'GET /api/alerts/a1/clips': () => jsonResponse({ clips: [clip('c1'), clip('c2')] }),
    })
    renderApp('/notifications/a1')
    expect(await screen.findByText('알림과 함께 온 영상')).toBeInTheDocument()
    const first = screen.getByLabelText('알림 영상 1')
    expect(first.tagName).toBe('VIDEO')
    expect(first).toHaveAttribute('src', '/api/alerts/a1/clips/c1')
    expect(first).toHaveAttribute('controls')
    expect(screen.getByLabelText('알림 영상 2')).toBeInTheDocument()
    expect(screen.getByText(/7일이 지나면 자동으로 지워집니다/)).toBeInTheDocument()
    expect(screen.getAllByText(/약 4초/).length).toBeGreaterThanOrEqual(2)
  })

  it('영상이 없으면 아무것도 그리지 않는다 (실제 센서 알림 등)', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/a1': () => jsonResponse(detail()),
      'GET /api/alerts/a1/clips': () => jsonResponse({ clips: [] }),
    })
    renderApp('/notifications/a1')
    await screen.findByText('근거가 된 신호')
    expect(screen.queryByText('알림과 함께 온 영상')).not.toBeInTheDocument()
  })

  it('목록을 불러오지 못하면 숨기지 않고 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/a1': () => jsonResponse(detail()),
      'GET /api/alerts/a1/clips': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/notifications/a1')
    expect(await screen.findByText('영상 목록을 불러오지 못했습니다.')).toBeInTheDocument()
  })
})
