import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeSocket } from '@/test/fakeSocket'
import { DETECTION_SETTINGS } from '@/test/fixtures'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const handlers = (extra = {}) => ({
  ...loggedInHandlers(),
  'GET /api/settings/detection': () => jsonResponse(DETECTION_SETTINGS),
  ...extra,
})

describe('감지 시간·민감도 화면', () => {
  it('서버의 현재 설정을 폼에 채운다', async () => {
    stubApi(handlers())
    renderApp('/settings/detection')
    expect(await screen.findByLabelText('시작')).toHaveValue('22:00')
    expect(screen.getByLabelText('종료')).toHaveValue('06:00')
    expect(screen.getByRole('radio', { name: /보통/ })).toBeChecked()
    expect(screen.getByLabelText(/같은 알림을 다시 만들지 않는 시간/)).toHaveValue(10)
  })

  it('바꾼 값을 모든 항목과 함께 PUT 으로 저장한다', async () => {
    let body: Record<string, unknown> | undefined
    stubApi(
      handlers({
        'PUT /api/settings/detection': (req: { body: unknown }) => {
          body = req.body as Record<string, unknown>
          return jsonResponse({
            ...DETECTION_SETTINGS,
            ...body,
            updatedAt: '2026-11-14T00:00:00.000Z',
          })
        },
      }),
    )
    renderApp('/settings/detection')
    await userEvent.click(await screen.findByRole('radio', { name: /높음/ }))
    const cooldown = screen.getByLabelText(/같은 알림을 다시 만들지 않는 시간/)
    await userEvent.clear(cooldown)
    await userEvent.type(cooldown, '20')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(body).toMatchObject({ sensitivity: 'HIGH', cooldownMinutes: 20, nightStart: '22:00' }),
    )
    expect(await screen.findByText(/저장했습니다/)).toBeInTheDocument()
  })

  it('잘못된 값은 서버에 보내지 않고 항목별로 알린다', async () => {
    const fetchMock = stubApi(handlers())
    renderApp('/settings/detection')
    const critical = await screen.findByLabelText(/배터리 위급 기준/)
    await userEvent.clear(critical)
    await userEvent.type(critical, '30') // 부족 기준(20)보다 높음
    const cooldown = screen.getByLabelText(/같은 알림을 다시 만들지 않는 시간/)
    await userEvent.clear(cooldown)
    await userEvent.type(cooldown, '999')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(
      await screen.findByText('배터리 위급 기준은 부족 기준보다 낮아야 합니다.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(1)
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('시작과 종료 시각이 같으면 거부한다', async () => {
    stubApi(handlers())
    renderApp('/settings/detection')
    const end = await screen.findByLabelText('종료')
    // time 입력은 값을 직접 지정한다
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(end, '22:00')
      end.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('야간 시작과 종료 시각은 달라야 합니다.')).toBeInTheDocument()
  })

  it('저장 실패는 서버 메시지와 함께 보여 준다', async () => {
    stubApi(
      handlers({
        'PUT /api/settings/detection': () =>
          errorResponse(500, 'INTERNAL_ERROR', '서버에서 문제가 발생했습니다.'),
      }),
    )
    renderApp('/settings/detection')
    await userEvent.click(await screen.findByRole('button', { name: '저장' }))
    expect(await screen.findByText('서버에서 문제가 발생했습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/저장했습니다/)).not.toBeInTheDocument()
  })

  it('다른 기기에서 설정이 바뀌면(settings.updated) 폼이 새 값으로 갱신된다', async () => {
    let current = DETECTION_SETTINGS
    stubApi(handlers({ 'GET /api/settings/detection': () => jsonResponse(current) }))
    renderApp('/settings/detection')
    expect(await screen.findByLabelText('시작')).toHaveValue('22:00')
    // 소켓은 "바뀌었다"는 신호이고, 화면은 서버에서 새 값을 다시 읽는다.
    current = { ...DETECTION_SETTINGS, nightStart: '21:00', updatedAt: '2026-11-14T01:00:00.000Z' }
    act(() => fakeSocket.emit('settings.updated', { settings: current }))
    await waitFor(() => expect(screen.getByLabelText('시작')).toHaveValue('21:00'))
  })

  it('불러오기에 실패하면 빈 폼 대신 오류를 보여 준다', async () => {
    stubApi(
      handlers({
        'GET /api/settings/detection': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      }),
    )
    renderApp('/settings/detection')
    expect(await screen.findByText('설정을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByLabelText('시작')).not.toBeInTheDocument()
  })
})
