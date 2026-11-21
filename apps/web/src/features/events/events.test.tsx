import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES, type TimelineEvent } from '@tetris/shared'
import { fakeSocketStatus } from '@/test/fakeSocket'
import { makeSensor, makeTimelineEvent, TIMELINE_SUMMARY } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
  type ApiRequest,
} from '@/test/helpers'
import { groupByLocalDate } from './grouping'

const SENSORS = [
  makeSensor({ id: 's1', name: '침대 옆 센서(테스트)' }),
  makeSensor({ id: 's2', name: '현관 센서(테스트)', zone: 'ENTRANCE' }),
]

const handlers = (
  events: TimelineEvent[] = [makeTimelineEvent()],
  extra: Record<string, ApiHandler> = {},
) => ({
  ...loggedInHandlers(),
  'GET /api/sensors': () => jsonResponse({ sensors: SENSORS }),
  'GET /api/timeline': () => jsonResponse({ events, nextCursor: null }),
  'GET /api/timeline/summary': () =>
    jsonResponse({
      ...TIMELINE_SUMMARY,
      total: events.length,
      lastEventAt: events[0]?.occurredAt ?? null,
    }),
  ...extra,
})

/** 목록 요청의 쿼리를 모아 두는 핸들러 */
function recordList(events: TimelineEvent[] = [makeTimelineEvent()]) {
  const searches: URLSearchParams[] = []
  const handler: ApiHandler = (req: ApiRequest) => {
    searches.push(new URLSearchParams(req.search))
    return jsonResponse({ events, nextCursor: null })
  }
  return { searches, handler }
}

const ev = (id: string, overrides: Partial<TimelineEvent> = {}) =>
  makeTimelineEvent({ id, ...overrides })

describe('움직임 기록: 구성', () => {
  it('제목·설명·기간 선택·추정 안내·조건 영역을 보여 준다', async () => {
    stubApi(handlers())
    renderApp('/events')
    expect(
      await screen.findByRole('heading', { level: 1, name: '움직임 기록' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/시각은 이 기기의 시간대\(Asia\/Seoul\) 기준입니다/),
    ).toBeInTheDocument()
    expect(screen.getByText(/센서 위치와 규칙에 따른 추정입니다/)).toBeInTheDocument()

    const period = within(screen.getByRole('group', { name: '조회 기간' }))
    for (const label of ['오늘', '최근 7일', '최근 30일', '직접 선택']) {
      expect(period.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(period.getByRole('button', { name: '최근 7일' })).toHaveAttribute('aria-pressed', 'true')

    for (const label of [
      '시작 날짜',
      '종료 날짜',
      '센서',
      '이벤트 종류',
      '주의 수준',
      '알림 발생 여부',
      '정렬',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '조건 초기화' })).toBeDisabled()
  })

  it('이벤트 종류 선택지에 여섯 가지 유형이 있고, 침대·현관 관련은 "추정"이라고 쓴다', async () => {
    stubApi(handlers())
    renderApp('/events')
    const select = await screen.findByLabelText('이벤트 종류')
    const labels = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(labels).toEqual([
      '모든 종류',
      '침대 주변 움직임 (추정)',
      '일반 움직임',
      '현관 주변 움직임 (추정)',
      '센서 연결 끊김',
      '센서 연결 복구',
      '배터리 부족',
    ])
    for (const label of labels)
      for (const phrase of FORBIDDEN_PHRASES) expect(label).not.toContain(phrase)
  })

  it('센서 선택지는 등록된 센서 목록이다', async () => {
    stubApi(handlers())
    renderApp('/events')
    const options = within(await screen.findByLabelText('센서')).getAllByRole('option')
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('센서'))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['모든 센서', '침대 옆 센서(테스트)', '현관 센서(테스트)']),
    )
    expect(options.length).toBeGreaterThan(0)
  })
})

describe('움직임 기록: 타임라인과 요약', () => {
  it('날짜별로 묶어 로컬 시간으로 보여 주고, 시각·종류·위치·설명·주의 수준·알림 여부를 담는다', async () => {
    const today = new Date().toISOString()
    stubApi(
      handlers([
        ev('mov_today', {
          occurredAt: today,
          receivedAt: today,
          eventType: 'ENTRANCE_ACTIVITY',
          zone: 'ENTRANCE',
          sensorName: '현관 센서(테스트)',
          attention: 'URGENT',
          alertRaised: true,
          alerts: [{ id: 'a1', type: 'ENTRANCE_APPROACH', severity: 'URGENT', status: 'OPEN' }],
          description: '현관 센서에서 움직임 신호가 있었습니다. 현관 주변의 움직임으로 추정됩니다.',
        }),
        ev('mov_b', { occurredAt: '2026-11-13T15:05:00.000Z' }), // 한국 11/14 00:05
        ev('mov_c', {
          occurredAt: '2026-11-13T14:30:00.000Z',
          eventType: 'SENSOR_OFFLINE',
          attention: 'NOTICE',
        }), // 한국 11/13 23:30
      ]),
    )
    renderApp('/events')
    const timeline = within(await screen.findByRole('region', { name: '이벤트 타임라인' }))
    const headings = timeline.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings[0]).toMatch(/오늘/)
    expect(headings[1]).toMatch(/2026년 11월 14일 토요일.*1건/)
    expect(headings[2]).toMatch(/2026년 11월 13일 금요일.*1건/)

    const first = within(timeline.getAllByRole('listitem')[0]!)
    expect(first.getByText('현관 주변 움직임 (추정)')).toBeInTheDocument()
    expect(first.getByText(/현관 · 현관 센서\(테스트\)/)).toBeInTheDocument()
    expect(first.getByText('즉시 확인 권장')).toBeInTheDocument()
    expect(first.getByText('알림 발생')).toBeInTheDocument()
    expect(first.getByText(/현관 주변의 움직임으로 추정됩니다/)).toBeInTheDocument()

    // 로컬(한국) 시간으로 날짜가 갈린다: UTC 로는 같은 날이지만 화면에서는 다른 날이다
    expect(
      within(timeline.getAllByRole('listitem')[1]!).getByText('오전 12:05'),
    ).toBeInTheDocument()
    expect(
      within(timeline.getAllByRole('listitem')[2]!).getByText('오후 11:30'),
    ).toBeInTheDocument()
  })

  it('이벤트 아이콘은 장식이라 스크린리더에서 숨기고, 종류는 글자로 전달한다', async () => {
    stubApi(handlers([ev('mov_a', { eventType: 'LOW_BATTERY', attention: 'INFO' })]))
    renderApp('/events')
    const item = (await screen.findAllByRole('listitem'))[0]!
    expect(item.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0)
    expect(within(item).getByText('배터리 부족')).toBeInTheDocument()
  })

  it('요약: 전체 감지 건수 · 주의 이벤트 · 최근 감지 시간', async () => {
    stubApi(
      handlers([ev('mov_a')], {
        'GET /api/timeline/summary': () =>
          jsonResponse({
            total: 42,
            attention: 5,
            alertRaised: 3,
            lastEventAt: new Date(Date.now() - 5 * 60_000).toISOString(),
            generatedAt: new Date().toISOString(),
          }),
      }),
    )
    renderApp('/events')
    const summary = within(await screen.findByRole('region', { name: '이벤트 요약' }))
    await waitFor(() =>
      expect(summary.getByText('전체 감지 건수').parentElement).toHaveTextContent('42건'),
    )
    expect(summary.getByText('주의 이벤트').parentElement).toHaveTextContent('5건')
    expect(summary.getByText('최근 감지 시간').parentElement).toHaveTextContent('5분 전')
  })

  it('요약이 비면 "기록 없음", 요약을 못 불러오면 0건처럼 보이지 않고 알린다', async () => {
    stubApi(handlers([]))
    const first = renderApp('/events')
    expect(await screen.findByText('기록 없음')).toBeInTheDocument()
    first.unmount()

    stubApi(
      handlers([ev('mov_a')], {
        'GET /api/timeline/summary': () => errorResponse(500, 'INTERNAL_ERROR', '오류'),
      }),
    )
    renderApp('/events')
    expect(await screen.findByText(/요약을 불러오지 못했습니다/)).toBeInTheDocument()
    expect(screen.queryByText('전체 감지 건수')).not.toBeInTheDocument()
    // 요약이 실패해도 기록은 볼 수 있다
    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
  })
})

describe('움직임 기록: 조건·정렬·기간', () => {
  it('기본 요청: 최근 7일(로컬 하루의 시작~끝, ISO)·최신순·30건', async () => {
    const { searches, handler } = recordList()
    stubApi(handlers([], { 'GET /api/timeline': handler }))
    renderApp('/events')
    await waitFor(() => expect(searches.length).toBeGreaterThan(0))
    const query = searches[0]!
    expect(query.get('order')).toBe('desc')
    expect(query.get('limit')).toBe('30')
    const from = new Date(query.get('from')!)
    const to = new Date(query.get('to')!)
    expect(Number.isNaN(from.getTime())).toBe(false)
    expect(to.getTime() - from.getTime()).toBeGreaterThan(6.9 * 24 * 3_600_000)
    expect(to.getTime() - from.getTime()).toBeLessThan(7 * 24 * 3_600_000)
    expect(query.get('type')).toBeNull()
  })

  it('이벤트 종류·주의 수준·알림 여부·센서·정렬을 고르면 요청에 반영하고 주소에도 남긴다', async () => {
    const { searches, handler } = recordList()
    stubApi(handlers([], { 'GET /api/timeline': handler }))
    const { router } = renderApp('/events')
    await userEvent.selectOptions(await screen.findByLabelText('이벤트 종류'), 'LOW_BATTERY')
    await userEvent.selectOptions(screen.getByLabelText('주의 수준'), 'NOTICE')
    await userEvent.selectOptions(screen.getByLabelText('알림 발생 여부'), 'true')
    await userEvent.selectOptions(screen.getByLabelText('정렬'), 'asc')
    await waitFor(() =>
      expect(screen.getByLabelText('센서').querySelectorAll('option').length).toBe(3),
    )
    await userEvent.selectOptions(screen.getByLabelText('센서'), 's2')

    await waitFor(() => {
      const last = searches.at(-1)!
      expect(
        Object.fromEntries(
          ['type', 'attention', 'alert', 'order', 'sensorId'].map((k) => [k, last.get(k)]),
        ),
      ).toEqual({
        type: 'LOW_BATTERY',
        attention: 'NOTICE',
        alert: 'true',
        order: 'asc',
        sensorId: 's2',
      })
    })
    const search = new URLSearchParams(router.state.location.search)
    expect(Object.fromEntries(search)).toMatchObject({
      type: 'LOW_BATTERY',
      attention: 'NOTICE',
      alert: 'true',
      order: 'asc',
      sensor: 's2',
    })
    expect(screen.getByText('4개 조건 적용 중')).toBeInTheDocument()
  })

  it('주소의 조건(새로고침·링크 공유)으로 같은 목록이 열린다', async () => {
    const { searches, handler } = recordList()
    stubApi(handlers([], { 'GET /api/timeline': handler }))
    renderApp(
      '/events?type=SENSOR_OFFLINE&attention=NOTICE&order=asc&from=2026-11-01&to=2026-11-10',
    )
    expect(await screen.findByLabelText('이벤트 종류')).toHaveValue('SENSOR_OFFLINE')
    expect(screen.getByLabelText('주의 수준')).toHaveValue('NOTICE')
    expect(screen.getByLabelText('정렬')).toHaveValue('asc')
    expect(screen.getByLabelText('시작 날짜')).toHaveValue('2026-11-01')
    await waitFor(() => expect(searches.length).toBeGreaterThan(0))
    expect(searches[0]!.get('from')).toBe('2026-10-31T15:00:00.000Z') // 한국 11/1 0시
    expect(searches[0]!.get('to')).toBe('2026-11-10T14:59:59.999Z') // 한국 11/10 끝
    expect(screen.getByRole('button', { name: '직접 선택' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('올바르지 않은 주소 값은 "전체"로 취급하고 화면이 깨지지 않는다', async () => {
    stubApi(handlers())
    renderApp('/events?type=FALL&attention=HIGH&alert=maybe&order=random&from=어제')
    expect(await screen.findByLabelText('이벤트 종류')).toHaveValue('')
    expect(screen.getByLabelText('주의 수준')).toHaveValue('')
    expect(screen.getByLabelText('알림 발생 여부')).toHaveValue('')
    expect(screen.getByLabelText('정렬')).toHaveValue('desc')
  })

  it('빠른 기간 선택: 오늘 / 최근 30일, 선택한 것이 눌림 상태로 표시된다', async () => {
    const { searches, handler } = recordList()
    stubApi(handlers([], { 'GET /api/timeline': handler }))
    const { router } = renderApp('/events')
    const period = within(await screen.findByRole('group', { name: '조회 기간' }))
    await userEvent.click(period.getByRole('button', { name: '오늘' }))
    expect(period.getByRole('button', { name: '오늘' })).toHaveAttribute('aria-pressed', 'true')
    expect(period.getByRole('button', { name: '최근 7일' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByLabelText('시작 날짜')).toHaveValue(
      screen.getByLabelText('종료 날짜').getAttribute('value'),
    )
    await waitFor(() => {
      const last = searches.at(-1)!
      const span = Date.parse(last.get('to')!) - Date.parse(last.get('from')!)
      expect(span).toBeLessThan(24 * 3_600_000)
    })
    await userEvent.click(period.getByRole('button', { name: '최근 30일' }))
    await waitFor(() => {
      const last = searches.at(-1)!
      expect(Date.parse(last.get('to')!) - Date.parse(last.get('from')!)).toBeGreaterThan(
        29.9 * 24 * 3_600_000,
      )
    })
    // 최근 7일로 돌아오면 주소에서 기간이 사라진다 (기본값)
    await userEvent.click(period.getByRole('button', { name: '최근 7일' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('조건 초기화: 모든 조건과 기간을 기본으로 되돌린다', async () => {
    stubApi(handlers())
    const { router } = renderApp('/events?type=LOW_BATTERY&order=asc&from=2026-11-01&to=2026-11-10')
    const reset = await screen.findByRole('button', { name: '조건 초기화' })
    expect(reset).toBeEnabled()
    await userEvent.click(reset)
    expect(router.state.location.search).toBe('')
    expect(screen.getByLabelText('이벤트 종류')).toHaveValue('')
    expect(screen.getByLabelText('정렬')).toHaveValue('desc')
    expect(screen.getByRole('button', { name: '조건 초기화' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '최근 7일' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('시작 날짜가 종료 날짜보다 늦으면 조회하지 않고 이유를 알린다', async () => {
    const { searches, handler } = recordList()
    stubApi(handlers([], { 'GET /api/timeline': handler }))
    renderApp('/events?from=2026-11-10&to=2026-11-01')
    expect(
      (await screen.findAllByText(/시작 날짜가 종료 날짜보다 늦습니다/)).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('조회 기간을 확인해 주세요')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(searches).toHaveLength(0)
    expect(screen.queryByRole('region', { name: '이벤트 요약' })).not.toBeInTheDocument()
  })
})

describe('움직임 기록: 더 보기(페이지네이션)', () => {
  const page = (ids: string[], nextCursor: string | null) =>
    jsonResponse({ events: ids.map((id) => ev(id)), nextCursor })

  it('"더 보기"로 다음 쪽을 이어 읽고, 마지막이면 더 보기가 사라진다', async () => {
    const cursors: (string | null)[] = []
    stubApi(
      handlers([], {
        'GET /api/timeline': (req) => {
          const cursor = new URLSearchParams(req.search).get('cursor')
          cursors.push(cursor)
          return cursor ? page(['mov_c', 'mov_d'], null) : page(['mov_a', 'mov_b'], 'next-1')
        },
      }),
    )
    renderApp('/events')
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    expect(
      screen.getByText(/2건 표시 중 · 아직 불러오지 않은 기록이 더 있습니다/),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '더 보기' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4))
    expect(cursors).toEqual([null, 'next-1'])
    expect(screen.getByText(/4건 표시 중 · 마지막 기록입니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument()
  })

  it('다음 쪽을 읽다 실패해도 이미 본 기록은 그대로 두고, 다시 시도할 수 있다', async () => {
    let failing = true
    stubApi(
      handlers([], {
        'GET /api/timeline': (req) => {
          const cursor = new URLSearchParams(req.search).get('cursor')
          if (!cursor) return page(['mov_a', 'mov_b'], 'next-1')
          return failing ? errorResponse(500, 'INTERNAL_ERROR', '서버 오류') : page(['mov_c'], null)
        },
      }),
    )
    renderApp('/events')
    await screen.findAllByRole('listitem')
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }))
    expect(await screen.findByText(/다음 기록을 불러오지 못했습니다/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    failing = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    expect(screen.queryByText(/다음 기록을 불러오지 못했습니다/)).not.toBeInTheDocument()
  })
})

describe('움직임 기록: 빈 상태·오류·연결 끊김', () => {
  it('기록이 없으면(기본 조건) 안내하고 센서 확인으로 이어 준다', async () => {
    stubApi(handlers([]))
    renderApp('/events')
    expect(await screen.findByText('이 기간에 기록된 움직임이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '센서 확인하기' })).toHaveAttribute('href', '/sensors')
  })

  it('조건에 맞는 기록이 없으면 다르게 안내하고, 초기화 버튼으로 되돌릴 수 있다', async () => {
    stubApi(handlers([]))
    const { router } = renderApp('/events?type=LOW_BATTERY')
    expect(await screen.findByText('조건에 맞는 기록이 없습니다')).toBeInTheDocument()
    expect(screen.queryByText('이 기간에 기록된 움직임이 없습니다')).not.toBeInTheDocument()
    const empty = screen.getByText('조건에 맞는 기록이 없습니다').closest('div')!
    await userEvent.click(within(empty).getByRole('button', { name: '조건 초기화' }))
    expect(router.state.location.search).toBe('')
    expect(await screen.findByText('이 기간에 기록된 움직임이 없습니다')).toBeInTheDocument()
  })

  it('불러오지 못하면 원인과 요청 번호를 알리고, 다시 시도하면 불러온다', async () => {
    let failing = true
    stubApi(
      handlers([ev('mov_a')], {
        'GET /api/timeline': () =>
          failing
            ? new Response(
                JSON.stringify({
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: '기록을 읽는 중 문제가 생겼습니다.',
                    requestId: 'req-123',
                  },
                }),
                { status: 500, headers: { 'Content-Type': 'application/json' } },
              )
            : jsonResponse({ events: [ev('mov_a')], nextCursor: null }),
      }),
    )
    renderApp('/events')
    const alert = within(
      await screen
        .findByText('기록을 불러오지 못했습니다')
        .then((el) => el.closest('[role="alert"]') as HTMLElement),
    )
    expect(alert.getByText('기록을 읽는 중 문제가 생겼습니다.')).toBeInTheDocument()
    expect(alert.getByText(/req-123/)).toBeInTheDocument()
    expect(screen.queryByText('이 기간에 기록된 움직임이 없습니다')).not.toBeInTheDocument() // 실패를 "없음"으로 보이지 않는다

    failing = false
    await userEvent.click(alert.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
  })

  it('연결이 끊겨 있고 받은 기록이 없으면 "기록 없음"이 아니라 연결 문제라고 알린다', async () => {
    fakeSocketStatus.set('disconnected')
    stubApi(handlers([], { 'GET /api/timeline': () => new Promise<Response>(() => undefined) }))
    renderApp('/events')
    expect(await screen.findByText('연결이 끊겨 기록을 볼 수 없습니다')).toBeInTheDocument()
    expect(screen.queryByText('이 기간에 기록된 움직임이 없습니다')).not.toBeInTheDocument()
  })

  it('이미 받은 기록이 있는 채로 연결이 끊기면 "최신 기록이 아닐 수 있다"고 알린다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(handlers([ev('mov_a')]))
    renderApp('/events')
    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
    act(() => fakeSocketStatus.set('disconnected'))
    expect(await screen.findByText('최신 기록이 아닐 수 있습니다')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('움직임 기록: 이벤트 상세', () => {
  const detailEvent = ev('mov_d1', {
    eventType: 'BED_EXIT_CANDIDATE',
    attention: 'NOTICE',
    alertRaised: true,
    alerts: [{ id: 'alert-9', type: 'BED_TO_PATH', severity: 'NOTICE', status: 'OPEN' }],
    isLate: true,
    occurredAt: '2026-11-13T15:05:00.000Z',
    receivedAt: '2026-11-13T15:10:00.000Z',
    description:
      '침대 옆 센서의 움직임 신호가 침대 주변 규칙에 사용되었습니다. 센서 위치와 규칙에 따른 추정입니다.',
    rule: {
      alertType: 'BED_TO_PATH',
      text: '야간(22:00~06:00)에 이동 경로 센서의 신호가 이어지면 알립니다.',
    },
  })
  const detailHandlers = (extra: Record<string, ApiHandler> = {}) =>
    handlers([detailEvent], {
      'GET /api/timeline/mov_d1': () =>
        jsonResponse({
          event: detailEvent,
          relatedEvents: [
            {
              id: 'mov_p1',
              sensorName: '복도 센서(테스트)',
              zone: 'PATH',
              occurredAt: '2026-11-13T15:07:00.000Z',
            },
          ],
        }),
      ...extra,
    })

  it('카드를 누르면 상세가 열리고 주소에 남으며, 닫으면 주소에서 사라진다', async () => {
    stubApi(detailHandlers())
    const { router } = renderApp('/events')
    await userEvent.click(await screen.findByRole('button', { name: /침대 주변 움직임 \(추정\)/ }))
    const dialog = within(await screen.findByRole('dialog', { name: '침대 주변 움직임 (추정)' }))
    expect(router.state.location.search).toBe('?event=mov_d1')
    expect(dialog.getByRole('heading', { name: '판단에 사용된 규칙' })).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.search).toBe('')
  })

  it('발생·수신 시각, 센서 정보와 현재 상태, 판단 규칙, 알림 처리, 관련 신호를 보여 준다', async () => {
    stubApi(detailHandlers())
    renderApp('/events?event=mov_d1')
    const dialog = within(await screen.findByRole('dialog'))
    // 발생·수신 시각 (로컬 시간)
    expect((await dialog.findAllByText('11월 14일 오전 12:05')).length).toBeGreaterThan(0)
    expect(dialog.getByText('11월 14일 오전 12:10')).toBeInTheDocument()
    expect(dialog.getByText(/발생보다 늦게 도착한 신호입니다/)).toBeInTheDocument()
    expect(dialog.getByText(/Asia\/Seoul \(이 기기 기준\)/)).toBeInTheDocument()
    // 센서 정보 + 현재 상태(이 시점의 상태가 아님을 밝힘)
    expect(dialog.getAllByRole('link', { name: '침대 옆 센서(테스트)' })[0]).toHaveAttribute(
      'href',
      '/sensors/s1',
    )
    expect(await dialog.findByText(/이 기록이 만들어진 때의 상태가 아닙니다/)).toBeInTheDocument()
    expect(dialog.getByText('연결됨')).toBeInTheDocument()
    // 규칙
    expect(
      dialog.getByText(/야간\(22:00~06:00\)에 이동 경로 센서의 신호가 이어지면 알립니다/),
    ).toBeInTheDocument()
    expect(dialog.getByText(/현재 감지 설정 기준의 설명입니다/)).toBeInTheDocument()
    // 알림 처리
    expect(dialog.getByText('침대 주변에서 이동 경로로 이어진 움직임')).toBeInTheDocument()
    expect(dialog.getByText('진행 중')).toBeInTheDocument()
    expect(dialog.getByRole('link', { name: '알림 자세히 보기' })).toHaveAttribute(
      'href',
      '/notifications/alert-9',
    )
    // 관련 신호
    expect(await dialog.findByText('함께 근거가 된 신호')).toBeInTheDocument()
    expect(dialog.getByText(/이동 경로 · 복도 센서\(테스트\)/)).toBeInTheDocument()
    // 추정 안내
    expect(dialog.getByText('센서 위치와 규칙에 따른 추정입니다')).toBeInTheDocument()
  })

  it('알림과 이어지지 않은 기록은 알림이 없다고 밝히고, 센서 상태 이벤트에는 추정 안내가 없다', async () => {
    const plain = ev('mov_x', { eventType: 'SENSOR_RESTORED' })
    stubApi(
      handlers([plain], {
        'GET /api/timeline/mov_x': () => jsonResponse({ event: plain, relatedEvents: [] }),
      }),
    )
    renderApp('/events?event=mov_x')
    const dialog = within(await screen.findByRole('dialog', { name: '센서 연결 복구' }))
    expect(dialog.getByText('이 기록으로 만들어진 알림은 없습니다.')).toBeInTheDocument()
    expect(dialog.queryByText('센서 위치와 규칙에 따른 추정입니다')).not.toBeInTheDocument()
  })

  it('목록에 없는 기록(링크로 바로 연 경우)도 상세를 불러와 보여 준다', async () => {
    stubApi(
      handlers([], {
        'GET /api/timeline/mov_d1': () => jsonResponse({ event: detailEvent, relatedEvents: [] }),
      }),
    )
    renderApp('/events?event=mov_d1')
    expect(
      await screen.findByRole('dialog', { name: '침대 주변 움직임 (추정)' }),
    ).toBeInTheDocument()
  })

  it('없는 기록이면 삭제되었거나 보관 기간이 지났을 수 있다고 알린다', async () => {
    stubApi(
      handlers([], {
        'GET /api/timeline/mov_zzz': () =>
          errorResponse(404, 'NOT_FOUND', '기록을 찾을 수 없습니다.'),
      }),
    )
    renderApp('/events?event=mov_zzz')
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByText('기록을 찾을 수 없습니다')).toBeInTheDocument()
    expect(dialog.getByText(/보관 기간이 지난 기록일 수 있습니다/)).toBeInTheDocument()
  })

  it('상세를 불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    let failing = true
    stubApi(
      handlers([], {
        'GET /api/timeline/mov_d1': () =>
          failing
            ? errorResponse(500, 'INTERNAL_ERROR', '상세를 읽지 못했습니다.')
            : jsonResponse({ event: detailEvent, relatedEvents: [] }),
      }),
    )
    renderApp('/events?event=mov_d1')
    const dialog = within(await screen.findByRole('dialog'))
    expect(await dialog.findByText('기록을 불러오지 못했습니다.')).toBeInTheDocument()
    failing = false
    await userEvent.click(dialog.getByRole('button', { name: '다시 시도' }))
    expect(await dialog.findByText('판단에 사용된 규칙')).toBeInTheDocument()
  })

  it('조건을 바꾸면 열어 둔 상세는 닫힌다', async () => {
    stubApi(detailHandlers())
    const { router } = renderApp('/events?event=mov_d1')
    await screen.findByRole('dialog')
    // 모달이 열려 있는 동안 뒤 화면은 조작할 수 없으므로 조건 변경은 주소로 일어난 일로 확인한다
    act(() => {
      void router.navigate('/events?type=LOW_BATTERY')
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('움직임 기록: 날짜 묶기', () => {
  it('로컬 날짜가 바뀔 때마다 묶음을 나누고 순서는 유지한다', () => {
    const groups = groupByLocalDate([
      ev('a', { occurredAt: '2026-11-14T14:59:00.000Z' }), // 한국 11/14 23:59
      ev('b', { occurredAt: '2026-11-14T14:00:00.000Z' }), // 한국 11/14 23:00
      ev('c', { occurredAt: '2026-11-14T15:00:00.000Z' }), // 한국 11/15 00:00
    ])
    expect(groups.map((g) => [g.date, g.events.map((e) => e.id)])).toEqual([
      ['2026-11-14', ['a', 'b']],
      ['2026-11-15', ['c']],
    ])
  })
  it('비어 있으면 묶음도 없다', () => {
    expect(groupByLocalDate([])).toEqual([])
  })
})
