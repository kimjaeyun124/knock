import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { makeSensor } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'
import { describeReceiveErrorReason, formatSilence, hasRecentReceiveError } from './sensorHealth'

describe('센서 상태 표시 도우미', () => {
  it('미응답 시간을 읽기 쉽게 바꾼다', () => {
    expect(formatSilence(30)).toBe('1분 미만')
    expect(formatSilence(5 * 60)).toBe('5분')
    expect(formatSilence(125 * 60)).toBe('2시간 5분')
    expect(formatSilence(3 * 3600)).toBe('3시간')
    expect(formatSilence(26 * 3600)).toBe('1일 2시간')
  })

  it('수신 오류 이유를 한국어로 풀어 쓰고, 모르는 이유도 숨기지 않는다', () => {
    expect(describeReceiveErrorReason('TOO_OLD')).toContain('오래된')
    expect(describeReceiveErrorReason('INVALID_PAYLOAD')).toContain('형식')
    expect(describeReceiveErrorReason('???')).toBe('받을 수 없는 데이터')
    expect(describeReceiveErrorReason(null)).toBe('이유를 알 수 없음')
  })

  it('최근 1시간 안의 수신 오류만 주의로 본다. 꺼 둔 센서는 보지 않는다', () => {
    const now = new Date('2026-11-18T01:00:00Z')
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
    const errors = (minutesAgo: number) => ({
      count: 1,
      lastAt: at(minutesAgo),
      lastReason: 'TOO_OLD',
    })
    expect(hasRecentReceiveError({ isActive: true, receiveErrors: errors(10) }, now)).toBe(true)
    expect(hasRecentReceiveError({ isActive: true, receiveErrors: errors(90) }, now)).toBe(false)
    expect(hasRecentReceiveError({ isActive: false, receiveErrors: errors(10) }, now)).toBe(false)
    expect(
      hasRecentReceiveError(
        { isActive: true, receiveErrors: { count: 0, lastAt: null, lastReason: null } },
        now,
      ),
    ).toBe(false)
  })
})

const list = (sensors: unknown[]) => ({
  ...loggedInHandlers(),
  'GET /api/sensors': () => jsonResponse({ sensors }),
})

describe('센서 목록: 장시간 미응답·수신 오류·배터리 알 수 없음', () => {
  it('끊긴 채 오래된 센서는 직접 확인하라고 알리고, 목록 위 요약에 센어 수를 센다', async () => {
    stubApi(
      list([
        makeSensor({
          id: 'a',
          name: '복도 센서',
          state: 'OFFLINE',
          longSilent: true,
          silentSeconds: 3 * 3600,
          lastSeenAt: '2026-11-13T12:00:00.000Z',
        }),
      ]),
    )
    renderApp('/sensors')
    expect(await screen.findByText(/장시간 미응답: 신호가 3시간 넘게 없습니다/)).toBeInTheDocument()
    expect(screen.getByText('그중 1시간 넘게 신호가 없는 센서 1개')).toBeInTheDocument()
  })

  it('데이터 수신 오류의 횟수·마지막 시각·이유를 보여 주고, 오류가 없으면 아무것도 띄우지 않는다', async () => {
    const recent = new Date(Date.now() - 10 * 60_000).toISOString()
    stubApi(
      list([
        makeSensor({
          id: 'a',
          name: '오류 센서',
          receiveErrors: { count: 3, lastAt: recent, lastReason: 'FUTURE_TIMESTAMP' },
        }),
        makeSensor({ id: 'b', name: '정상 센서' }),
      ]),
    )
    renderApp('/sensors')
    const card = (await screen.findByRole('heading', { name: '오류 센서' })).closest('li')!
    expect(within(card).getByText(/데이터 수신 오류 3건/)).toBeInTheDocument()
    expect(within(card).getByText(/미래인 신호/)).toBeInTheDocument()
    expect(within(card).getByText(/최근 1시간 안/)).toBeInTheDocument()
    const ok = screen.getByRole('heading', { name: '정상 센서' }).closest('li')!
    expect(within(ok).queryByText(/데이터 수신 오류/)).not.toBeInTheDocument()
    expect(screen.getByText('최근 1시간 안에 받지 못한 데이터가 있는 센서 1개')).toBeInTheDocument()
  })

  it('배터리 정보가 없으면 잔량을 만들어 내지 않고 "알 수 없음"으로 표시한다', async () => {
    stubApi(
      list([
        makeSensor({ id: 'a', name: '배터리 모름', batteryPercent: null, batteryLevel: 'UNKNOWN' }),
      ]),
    )
    renderApp('/sensors')
    const card = (await screen.findByRole('heading', { name: '배터리 모름' })).closest('li')!
    expect(
      within(card).getByText(/배터리 알 수 없음|배터리 정보 없음|알 수 없음/),
    ).toBeInTheDocument()
    expect(within(card).queryByText(/\d+%/)).not.toBeInTheDocument()
  })

  it('안내 문구에 확정적 표현이 없다', async () => {
    stubApi(
      list([
        makeSensor({
          id: 'a',
          state: 'OFFLINE',
          longSilent: true,
          silentSeconds: 7200,
          receiveErrors: { count: 1, lastAt: new Date().toISOString(), lastReason: 'TOO_OLD' },
        }),
      ]),
    )
    renderApp('/sensors')
    await screen.findByText(/장시간 미응답/)
    const text = document.querySelector('main')?.textContent ?? ''
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
  })
})

describe('센서 상세: heartbeat·끊김 기준·센서별 타임아웃', () => {
  const detail = (
    sensor: ReturnType<typeof makeSensor>,
    extra: Record<string, ApiHandler> = {},
  ) => ({
    ...loggedInHandlers(),
    [`GET /api/sensors/${sensor.id}`]: () => jsonResponse({ sensor }),
    ...extra,
  })

  it('마지막 통신과 마지막 heartbeat 를 따로 보여 주고, 받은 적 없으면 그렇게 말한다', async () => {
    const sensor = makeSensor({
      id: 's1',
      lastHeartbeatAt: '2026-11-13T14:55:00.000Z',
      effectiveOfflineAfterSeconds: 600,
    })
    stubApi(detail(sensor))
    renderApp('/sensors/s1')
    expect(await screen.findByText('마지막 heartbeat')).toBeInTheDocument()
    expect(screen.getByText(/10분 동안 신호가 없으면 \(가구 기본\)/)).toBeInTheDocument()

    stubApi(detail(makeSensor({ id: 's1', lastHeartbeatAt: null })))
    renderApp('/sensors/s1')
    expect((await screen.findAllByText(/받은 적 없음/)).length).toBeGreaterThan(0)
  })

  it('센서별 연결 끊김 기준을 분 단위로 저장하고, 범위 밖 값은 보내지 않는다', async () => {
    const bodies: unknown[] = []
    const sensor = makeSensor({ id: 's1' })
    stubApi(
      detail(sensor, {
        'PATCH /api/sensors/s1': (req) => {
          bodies.push(req.body)
          return jsonResponse({
            sensor: { ...sensor, offlineAfterSeconds: 1800, effectiveOfflineAfterSeconds: 1800 },
          })
        },
      }),
    )
    renderApp('/sensors/s1')
    const input = await screen.findByLabelText('이 센서의 기준 (분)')
    await userEvent.type(input, '90')
    await userEvent.click(screen.getByRole('button', { name: '기준 저장' }))
    expect(await screen.findByText(/1~60분 사이의 정수/)).toBeInTheDocument()
    expect(bodies).toEqual([])

    await userEvent.clear(input)
    await userEvent.type(input, '30')
    await userEvent.click(screen.getByRole('button', { name: '기준 저장' }))
    await waitFor(() => expect(bodies).toEqual([{ offlineAfterSeconds: 1800 }]))
  })

  it('저장에 실패하면 이전 값으로 되돌리고 이유를 알린다 (성공으로 보이지 않음)', async () => {
    const sensor = makeSensor({ id: 's1' })
    stubApi(
      detail(sensor, {
        'PATCH /api/sensors/s1': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      }),
    )
    renderApp('/sensors/s1')
    const input = await screen.findByLabelText('이 센서의 기준 (분)')
    await userEvent.type(input, '20')
    await userEvent.click(screen.getByRole('button', { name: '기준 저장' }))
    expect(await screen.findByText('저장하지 못해 이전 값으로 되돌렸습니다.')).toBeInTheDocument()
    expect(screen.queryByText('저장했습니다.')).not.toBeInTheDocument()
    expect(input).toHaveValue(null)
  })

  it('센서별 값이 있으면 가구 기본으로 되돌리는 버튼이 보이고, null 을 보낸다', async () => {
    const bodies: unknown[] = []
    const sensor = makeSensor({
      id: 's1',
      offlineAfterSeconds: 1200,
      effectiveOfflineAfterSeconds: 1200,
    })
    stubApi(
      detail(sensor, {
        'PATCH /api/sensors/s1': (req) => {
          bodies.push(req.body)
          return jsonResponse({
            sensor: { ...sensor, offlineAfterSeconds: null, effectiveOfflineAfterSeconds: 300 },
          })
        },
      }),
    )
    renderApp('/sensors/s1')
    expect(
      await screen.findByText(/20분 동안 신호가 없으면 \(이 센서에만 정한 값\)/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '가구 기본으로 되돌리기' }))
    await waitFor(() => expect(bodies).toEqual([{ offlineAfterSeconds: null }]))
  })
})
