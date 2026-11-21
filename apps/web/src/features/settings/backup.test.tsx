import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const NOW = new Date('2026-11-18T03:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const status = (overrides: Record<string, unknown>) => ({
  enabled: true,
  intervalHours: 24,
  keep: 7,
  lastSuccessAt: hoursAgo(2),
  lastFailureAt: null,
  lastRunFailed: false,
  backupCount: 3,
  ...overrides,
})

function show(body: unknown) {
  stubApi({
    ...loggedInHandlers(),
    'GET /api/data/summary': () =>
      jsonResponse({
        real: { sensors: 0, events: 0, alerts: 0 },
        simulated: { sensors: 0, events: 0, alerts: 0 },
      }),
    'GET /api/system/backup': () => jsonResponse(body),
  })
  renderApp('/settings/data')
}

describe('데이터 관리: 자동 백업', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('백업을 설정하지 않았으면 백업이 있는 것처럼 보이지 않고 경고한다', async () => {
    show(
      status({
        enabled: false,
        intervalHours: null,
        keep: null,
        lastSuccessAt: null,
        backupCount: 0,
      }),
    )
    expect(await screen.findByText('이 서버는 자동 백업을 하지 않습니다')).toBeInTheDocument()
    expect(screen.queryByText(/자동 백업이 켜져 있습니다/)).not.toBeInTheDocument()
  })

  it('정상이면 마지막 성공 시각과 보관 수를 보여 준다', async () => {
    show(status({}))
    expect(await screen.findByText('자동 백업이 켜져 있습니다')).toBeInTheDocument()
    expect(screen.getByText(/마지막 성공: 2시간 전/)).toBeInTheDocument()
    expect(screen.getByText(/최근 7개까지 보관합니다/)).toBeInTheDocument()
  })

  it('가장 최근 시도가 실패했으면 정상으로 보이지 않고 실패를 알린다', async () => {
    show(status({ lastRunFailed: true, lastFailureAt: hoursAgo(1) }))
    expect(await screen.findByText('가장 최근 백업에 실패했습니다')).toBeInTheDocument()
    expect(screen.queryByText('자동 백업이 켜져 있습니다')).not.toBeInTheDocument()
  })

  it('백업이 간격의 2배보다 오래되면 "오래되었습니다"로 알린다', async () => {
    show(status({ lastSuccessAt: hoursAgo(60) }))
    expect(await screen.findByText('백업이 오래되었습니다')).toBeInTheDocument()
    expect(screen.queryByText('자동 백업이 켜져 있습니다')).not.toBeInTheDocument()
  })

  it('켜져 있지만 아직 한 번도 성공하지 않았으면 그대로 알린다', async () => {
    show(status({ lastSuccessAt: null, backupCount: 0 }))
    expect(await screen.findByText('아직 만들어진 백업이 없습니다')).toBeInTheDocument()
  })

  it('조회에 실패하면 상태를 지어내지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/data/summary': () =>
        jsonResponse({
          real: { sensors: 0, events: 0, alerts: 0 },
          simulated: { sensors: 0, events: 0, alerts: 0 },
        }),
      'GET /api/system/backup': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/settings/data')
    expect(await screen.findByText('백업 상태를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText(/자동 백업이 켜져 있습니다/)).not.toBeInTheDocument()
  })
})
