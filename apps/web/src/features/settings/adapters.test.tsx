import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const adapter = (overrides: Record<string, unknown>) => ({
  id: 'hardware',
  label: '실제 센서 어댑터',
  origin: 'REAL',
  protocol: null,
  state: 'NOT_CONFIGURED',
  realHardwareConnected: false,
  lastEventAt: null,
  errorCount: 0,
  lastError: null,
  reconnectAttempts: 0,
  ...overrides,
})

describe('연동 현황: 센서 연결 방식', () => {
  it('실제 하드웨어가 없으면 "연결된 장치 없음"으로 보여 주고 연결된 것처럼 쓰지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/sensor-adapters': () =>
        jsonResponse({
          adapters: [
            adapter({
              id: 'simulator',
              label: '센서 시뮬레이터',
              origin: 'SIMULATED',
              state: 'DISCONNECTED',
            }),
            adapter({}),
          ],
        }),
    })
    renderApp('/settings/integrations')
    expect(await screen.findByText('실제 센서 어댑터')).toBeInTheDocument()
    expect(screen.getByText('연결된 장치 없음')).toBeInTheDocument()
    expect(screen.getByText('연결 안 됨')).toBeInTheDocument()
    expect(screen.getAllByText(/실제 하드웨어와 연결되어 있지 않습니다/)).toHaveLength(2)
    expect(screen.queryByText(/실제 하드웨어와 연결되어 있습니다/)).not.toBeInTheDocument()
  })

  it('처리하지 못한 신호 수와 마지막 이유를 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/sensor-adapters': () =>
        jsonResponse({
          adapters: [adapter({ state: 'FAILED', errorCount: 3, lastError: '연결 실패' })],
        }),
    })
    renderApp('/settings/integrations')
    expect(await screen.findByText(/처리하지 못한 신호 3건 \(연결 실패\)/)).toBeInTheDocument()
  })

  it('조회에 실패하면 어댑터 목록을 만들어 내지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/sensor-adapters': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/settings/integrations')
    expect(await screen.findByText('불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('실제 센서 어댑터')).not.toBeInTheDocument()
  })
})
