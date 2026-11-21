import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const summary = (simulated: { sensors: number; events: number; alerts: number }) => ({
  simulated,
  real: { sensors: 0, events: 0, alerts: 0 },
})

describe('시뮬레이션 데이터 표시', () => {
  it('시뮬레이터가 켜져 있고 시뮬레이션 데이터가 있으면 모든 화면 위에 실제 상황이 아님을 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/features': () => jsonResponse({ simulatorEnabled: true }),
      'GET /api/data/summary': () => jsonResponse(summary({ sensors: 3, events: 9, alerts: 1 })),
    })
    renderApp('/')
    const banner = await screen.findByText(/시연용 시뮬레이션 데이터가 있습니다/)
    expect(banner).toHaveTextContent('실제 센서나 실제 상황이 아닙니다')
    expect(screen.getByRole('link', { name: '데이터 관리' })).toHaveAttribute(
      'href',
      '/settings/data',
    )
  })

  it('시뮬레이션 데이터가 없으면 보이지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/features': () => jsonResponse({ simulatorEnabled: true }),
      'GET /api/data/summary': () => jsonResponse(summary({ sensors: 0, events: 0, alerts: 0 })),
    })
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    expect(screen.queryByText(/시연용 시뮬레이션 데이터/)).not.toBeInTheDocument()
  })

  it('시뮬레이터가 꺼져 있으면(운영) 데이터를 조회하지도 않고 보이지 않는다', async () => {
    let asked = false
    stubApi({
      ...loggedInHandlers(),
      'GET /api/data/summary': () => {
        asked = true
        return jsonResponse(summary({ sensors: 3, events: 9, alerts: 1 }))
      },
    })
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    expect(screen.queryByText(/시연용 시뮬레이션 데이터/)).not.toBeInTheDocument()
    expect(asked).toBe(false)
  })
})
