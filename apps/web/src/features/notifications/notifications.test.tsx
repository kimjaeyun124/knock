import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeSocket } from '@/test/fakeSocket'
import { makeAlert } from '@/test/fixtures'
import { fakeSocketStatus } from '@/test/fakeSocket'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

const detailBody = (overrides = {}) => ({
  alert: makeAlert(overrides),
  evidence: [
    {
      eventId: 'e1',
      sensorName: '현관문(테스트)',
      zone: 'ENTRANCE',
      occurredAt: '2026-11-13T15:10:00.000Z',
      isLate: true,
    },
  ],
  deliveries: [
    {
      id: 'd1',
      guardianId: 'g1',
      guardianName: '데모 보호자',
      channel: 'IN_APP',
      providerMode: 'REAL',
      status: 'FAILED',
      attempts: 3,
      lastError: '열려 있는 화면이 없습니다.',
      sentAt: null,
      createdAt: '2026-11-13T15:10:00.000Z',
    },
    {
      id: 'd2',
      guardianId: 'g1',
      guardianName: '데모 보호자',
      channel: 'SMS',
      providerMode: null,
      status: 'NOT_CONFIGURED',
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: '2026-11-13T15:10:00.000Z',
    },
  ],
})

const counts = (unread: number, unreadImportant = 0) => ({ unread, unreadImportant })

/** 알림 목록·읽지 않은 수를 상태로 가진 서버 대역. 읽음 처리 요청을 반영한다. */
function alertServer(initial: ReturnType<typeof makeAlert>[]) {
  const alerts = initial.map((alert) => ({ ...alert }))
  const calls: string[] = []
  const searches: URLSearchParams[] = []
  const unreadOf = () => alerts.filter((alert) => !alert.read)
  const handlers: Record<string, ApiHandler> = {
    ...loggedInHandlers(),
    'GET /api/alerts': ({ search }) => {
      const query = new URLSearchParams(search)
      searches.push(query)
      let list = alerts
      if (query.get('unread')) list = list.filter((alert) => !alert.read)
      if (query.get('important')) list = list.filter((alert) => alert.severity !== 'INFO')
      const status = query.get('status')
      if (status) list = list.filter((alert) => status.split(',').includes(alert.status))
      const type = query.get('type')
      if (type) list = list.filter((alert) => alert.type === type)
      return jsonResponse({ alerts: list, nextCursor: null })
    },
    'GET /api/alerts/unread-count': () =>
      jsonResponse(
        counts(unreadOf().length, unreadOf().filter((alert) => alert.severity !== 'INFO').length),
      ),
    'POST /api/alerts/read-all': () => {
      calls.push('read-all')
      const updated = unreadOf().length
      for (const alert of alerts) alert.read = true
      return jsonResponse({ updated })
    },
  }
  for (const alert of alerts) {
    handlers[`POST /api/alerts/${alert.id}/read`] = () => {
      calls.push(`read ${alert.id}`)
      alert.read = true
      return jsonResponse({ alert })
    }
  }
  return { alerts, calls, searches, handlers }
}

const THREE = () => [
  makeAlert({
    id: 'urgent',
    title: '현관 근처에서 움직임이 감지되었습니다',
    severity: 'URGENT',
    triggeredAt: '2026-11-13T15:30:00.000Z',
  }),
  makeAlert({
    id: 'notice',
    title: '침대 주변에서 이동 경로로 움직임이 이어졌습니다',
    type: 'BED_TO_PATH',
    severity: 'NOTICE',
    triggeredAt: '2026-11-13T15:20:00.000Z',
  }),
  makeAlert({
    id: 'info',
    title: "'복도' 센서의 배터리가 부족합니다 (15%)",
    type: 'LOW_BATTERY',
    severity: 'INFO',
    triggeredAt: '2026-11-13T15:10:00.000Z',
  }),
]

/** 알림 카드 목록 */
const cardsList = () =>
  screen.getAllByRole('heading', { level: 2 })[0]!.closest('ul') as HTMLElement

const cardOf = async (title: string) =>
  within((await screen.findByRole('link', { name: title })).closest('li')!)

describe('알림 센터: 읽지 않은 알림 수와 보기', () => {
  it('읽지 않은 알림 수와 중요 알림 수를 크게 보여 주고, 읽음이 해결이 아님을 알린다', async () => {
    stubApi(alertServer(THREE()).handlers)
    renderApp('/notifications')
    const summary = (await screen.findByText('읽지 않은 알림')).closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('3건'))
    expect(summary).toHaveTextContent('중요 2건')
    expect(summary).toHaveTextContent('읽었다고 해서 상황이 해결된 것은 아니며')
  })

  it('보기: 전체 · 읽지 않음 · 중요 — 각각 서버 조건으로 요청하고 주소에 남긴다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    const { router } = renderApp('/notifications')
    const tabs = within(await screen.findByRole('tablist', { name: '알림 보기' }))
    await waitFor(() =>
      expect(tabs.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        '전체',
        '읽지 않음 3',
        '중요',
      ]),
    )
    expect(tabs.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(3)
    expect(server.searches[0]?.get('unread')).toBeNull()
    expect(server.searches[0]?.get('important')).toBeNull()

    await userEvent.click(tabs.getByRole('tab', { name: /읽지 않음/ }))
    await waitFor(() => expect(server.searches.at(-1)?.get('unread')).toBe('true'))
    expect(router.state.location.search).toBe('?view=unread')

    await userEvent.click(tabs.getByRole('tab', { name: '중요' }))
    await waitFor(() => expect(server.searches.at(-1)?.get('important')).toBe('true'))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)) // 참고(INFO)는 중요가 아니다
    expect(screen.queryByText(/배터리가 부족합니다/)).not.toBeInTheDocument()

    await userEvent.click(tabs.getByRole('tab', { name: '전체' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('주소의 보기(새로고침·링크 공유)로 같은 목록이 열린다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications?view=important&status=OPEN&type=ENTRANCE_APPROACH')
    const tabs = await screen.findByRole('tablist', { name: '알림 보기' })
    expect(within(tabs).getByRole('tab', { name: '중요' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('처리 상태')).toHaveValue('OPEN')
    expect(screen.getByLabelText('알림 종류')).toHaveValue('ENTRANCE_APPROACH')
    // 헤더의 상태 띠도 알림 목록을 읽으므로, 이 화면의 조건이 담긴 요청을 찾는다.
    await waitFor(() => expect(server.searches.some((q) => q.get('important'))).toBe(true))
    const mine = server.searches.find((q) => q.get('important'))
    expect(
      Object.fromEntries(['important', 'status', 'type'].map((k) => [k, mine?.get(k)])),
    ).toEqual({
      important: 'true',
      status: 'OPEN',
      type: 'ENTRANCE_APPROACH',
    })
  })

  it('알림 종류·처리 상태 조건을 서버에 보낸다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications')
    await userEvent.selectOptions(await screen.findByLabelText('알림 종류'), 'LOW_BATTERY')
    await userEvent.selectOptions(screen.getByLabelText('처리 상태'), 'RESOLVED')
    await waitFor(() => {
      const last = server.searches.at(-1)!
      expect([last.get('type'), last.get('status')]).toEqual(['LOW_BATTERY', 'RESOLVED'])
    })
    expect(await screen.findByText('조건에 맞는 알림이 없습니다')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '조건 초기화' }))
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(3)
  })
})

describe('알림 센터: 알림 카드', () => {
  it('읽음 여부와 처리 상태를 따로 보여 주고, 읽었지만 처리하지 않은 알림은 그렇다고 밝힌다', async () => {
    stubApi(
      alertServer([
        makeAlert({ id: 'a', title: '읽지 않은 알림', read: false }),
        makeAlert({ id: 'b', title: '읽었지만 진행 중인 알림', read: true, status: 'OPEN' }),
        makeAlert({
          id: 'c',
          title: '읽고 종료한 알림',
          read: true,
          status: 'RESOLVED',
          resolution: 'CHECKED',
          resolvedAt: '2026-11-13T16:00:00.000Z',
        }),
      ]).handlers,
    )
    renderApp('/notifications')
    const unread = await cardOf('읽지 않은 알림')
    expect(unread.getByText('읽지 않음')).toBeInTheDocument()
    expect(unread.getByText('진행 중')).toBeInTheDocument()
    expect(unread.getByRole('button', { name: /읽음으로 표시/ })).toBeInTheDocument()

    const readOpen = await cardOf('읽었지만 진행 중인 알림')
    expect(readOpen.getByText('읽음')).toBeInTheDocument()
    expect(readOpen.getByText('진행 중')).toBeInTheDocument()
    expect(readOpen.getByText(/읽었지만 아직 확인 처리하지 않은 알림입니다/)).toBeInTheDocument()
    expect(readOpen.queryByRole('button', { name: /읽음으로 표시/ })).not.toBeInTheDocument()

    const done = await cardOf('읽고 종료한 알림')
    expect(done.getByText('읽음')).toBeInTheDocument()
    expect(done.getByText('종료 (확인함)')).toBeInTheDocument()
    expect(done.queryByText(/읽었지만 아직 확인 처리하지 않은/)).not.toBeInTheDocument()
  })

  it.each([
    ['WAITING', '대기'],
    ['ATTEMPTING', '전송 시도'],
    ['SENT', '전송 성공'],
    ['UNVERIFIED', '전달 확인 불가'],
    ['FAILED', '전송 실패'],
  ] as const)('전달 상태 %s 는 "%s"로 보여 준다', async (state, label) => {
    stubApi(
      alertServer([makeAlert({ id: 'a', title: '전달 알림', deliveryState: state })]).handlers,
    )
    renderApp('/notifications')
    expect((await cardOf('전달 알림')).getByText(label)).toBeInTheDocument()
  })

  it('전달 대상이 없으면 상태 배지 대신 기록을 말하고, 일부 채널이 실패했다면 숨기지 않는다', async () => {
    stubApi(
      alertServer([
        makeAlert({
          id: 'a',
          title: '참고 알림',
          deliveryState: null,
          delivery: { sent: 0, pending: 0, failed: 0, notConfigured: 3 },
        }),
        makeAlert({
          id: 'b',
          title: '일부 실패',
          deliveryState: 'UNVERIFIED',
          delivery: { sent: 1, pending: 0, failed: 1, notConfigured: 0 },
        }),
      ]).handlers,
    )
    renderApp('/notifications')
    expect((await cardOf('참고 알림')).getByText('연동되지 않은 채널 3')).toBeInTheDocument()
    const partial = await cardOf('일부 실패')
    expect(partial.getByText('전달 확인 불가')).toBeInTheDocument()
    expect(partial.getByText('일부 채널 전송 실패 1건')).toBeInTheDocument()
  })

  it('관련 움직임 기록 보기: 가리킬 기록이 있을 때만 움직임 기록 상세로 이어진다', async () => {
    stubApi(
      alertServer([
        makeAlert({
          id: 'a',
          title: '근거가 있는 알림',
          relatedEventIds: ['mov_e9', 'mov_e8'],
          triggeredAt: '2026-11-13T15:30:00.000Z',
        }),
        makeAlert({ id: 'b', title: '근거가 없는 알림', relatedEventIds: [] }),
      ]).handlers,
    )
    renderApp('/notifications')
    const withEvent = await cardOf('근거가 있는 알림')
    // 알림이 생긴 날(한국 11/14)로 목록을 맞추고, 가장 최근 근거 신호의 상세를 연다
    expect(withEvent.getByRole('link', { name: /관련 움직임 기록 보기/ })).toHaveAttribute(
      'href',
      '/events?event=mov_e9&from=2026-11-14&to=2026-11-14',
    )
    const without = await cardOf('근거가 없는 알림')
    expect(without.queryByRole('link', { name: /관련 움직임 기록 보기/ })).not.toBeInTheDocument()
  })

  it('시뮬레이션으로 만들어진 알림은 실제와 구분해 표시한다', async () => {
    stubApi(alertServer([makeAlert({ id: 'a', title: '시연 알림', origin: 'SIMULATED' })]).handlers)
    renderApp('/notifications')
    expect((await cardOf('시연 알림')).getByText('시뮬레이션')).toBeInTheDocument()
  })
})

describe('알림 센터: 읽음 처리', () => {
  it('개별 읽음: 화면에 바로 반영하고 읽지 않은 수를 줄이며, 처리 상태는 그대로다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications')
    const card = await cardOf('현관 근처에서 움직임이 감지되었습니다')
    await userEvent.click(card.getByRole('button', { name: /읽음으로 표시/ }))

    await waitFor(() => expect(server.calls).toEqual(['read urgent']))
    const after = await cardOf('현관 근처에서 움직임이 감지되었습니다')
    await waitFor(() => expect(after.getByText('읽음')).toBeInTheDocument())
    // 읽었어도 진행 중이고, 그렇다고 알린다
    expect(after.getByText('진행 중')).toBeInTheDocument()
    expect(after.getByText(/읽었지만 아직 확인 처리하지 않은 알림입니다/)).toBeInTheDocument()
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('2건'))
    expect(summary).toHaveTextContent('중요 1건')
  })

  it('개별 읽음이 실패하면 이전 상태로 되돌리고 알린다', async () => {
    const server = alertServer(THREE())
    stubApi({
      ...server.handlers,
      'POST /api/alerts/urgent/read': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/notifications')
    const card = await cardOf('현관 근처에서 움직임이 감지되었습니다')
    await userEvent.click(card.getByRole('button', { name: /읽음으로 표시/ }))
    expect(
      await screen.findByText(/읽음으로 표시하지 못해 이전 상태로 되돌렸습니다/),
    ).toBeInTheDocument()
    const after = await cardOf('현관 근처에서 움직임이 감지되었습니다')
    expect(after.getByText('읽지 않음')).toBeInTheDocument()
    expect(after.getByRole('button', { name: /읽음으로 표시/ })).toBeEnabled()
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    expect(summary).toHaveTextContent('3건')
  })

  it('모두 읽음: 확인 대화상자에서 읽음 ≠ 해결임을 알리고, 확인하면 모두 읽음이 되며 처리 상태는 그대로다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    await userEvent.click(screen.getByRole('button', { name: '모두 읽음으로 표시' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/처리 상태도 그대로입니다/)).toBeInTheDocument()
    expect(server.calls).toEqual([]) // 확인 전에는 보내지 않는다

    await userEvent.click(dialog.getByRole('button', { name: '모두 읽음으로 표시' }))
    await waitFor(() => expect(server.calls).toEqual(['read-all']))
    await waitFor(() => expect(within(cardsList()).getAllByText('읽음')).toHaveLength(3))
    expect(within(cardsList()).queryByText('읽지 않음')).not.toBeInTheDocument()
    expect(within(cardsList()).getAllByText('진행 중')).toHaveLength(3)
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('0건'))
    expect(await screen.findByText('3건을 읽음으로 표시했습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '모두 읽음으로 표시' })).toBeDisabled()
  })

  it('모두 읽음을 취소하면 아무것도 바뀌지 않는다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    await userEvent.click(screen.getByRole('button', { name: '모두 읽음으로 표시' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(server.calls).toEqual([])
    expect(screen.getAllByText('읽지 않음', { selector: 'span' }).length).toBeGreaterThan(0)
  })

  it('모두 읽음이 실패하면 되돌리고 원인을 알린다', async () => {
    const server = alertServer(THREE())
    stubApi({
      ...server.handlers,
      'POST /api/alerts/read-all': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    await userEvent.click(screen.getByRole('button', { name: '모두 읽음으로 표시' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: '모두 읽음으로 표시',
      }),
    )
    expect(
      await screen.findByText(/모두 읽음으로 표시하지 못해 이전 상태로 되돌렸습니다/),
    ).toBeInTheDocument()
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    expect(summary).toHaveTextContent('3건')
  })

  it('읽지 않은 알림이 없으면 "모두 읽음" 버튼이 꺼져 있다', async () => {
    stubApi(alertServer([makeAlert({ id: 'a', read: true })]).handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '모두 읽음으로 표시' })).toBeDisabled(),
    )
  })
})

describe('알림 센터: 실시간 갱신', () => {
  it('alert.created 가 오면 새로고침 없이 목록 맨 위에 넣고 읽지 않은 수를 올린다', async () => {
    const server = alertServer(THREE().slice(1))
    stubApi(server.handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('2건'))

    const arrived = makeAlert({
      id: 'fresh',
      title: '방금 온 알림',
      triggeredAt: '2026-11-13T16:00:00.000Z',
    })
    server.alerts.unshift(arrived) // 서버에도 생겼다 (소켓 신호가 먼저 도착한다)
    act(() => fakeSocket.emit('alert.created', { alert: arrived }))
    const headings = await screen.findByRole('link', { name: '방금 온 알림' })
    expect(headings).toBeInTheDocument()
    // 맨 위
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('방금 온 알림')
    await waitFor(() => expect(summary).toHaveTextContent('3건'))
  })

  it('같은 알림이 여러 번 와도(created 반복·updated) ID 기준으로 한 장만 있고 수도 한 번만 오른다', async () => {
    const server = alertServer(THREE().slice(1))
    stubApi(server.handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    const fresh = makeAlert({
      id: 'fresh',
      title: '중복 확인 알림',
      triggeredAt: '2026-11-13T16:00:00.000Z',
    })
    server.alerts.unshift(fresh)
    act(() => {
      fakeSocket.emit('alert.created', { alert: fresh })
      fakeSocket.emit('alert.created', { alert: fresh })
      fakeSocket.emit('alert.updated', { alert: { ...fresh, reminderCount: 1 } })
    })
    await screen.findByRole('link', { name: '중복 확인 알림' })
    expect(screen.getAllByRole('link', { name: '중복 확인 알림' })).toHaveLength(1)
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('3건')) // 2 + 1, 중복으로 더 오르지 않는다
  })

  it('alert.updated 는 같은 자리에서 처리 상태를 바꾸되 읽음 여부는 바꾸지 않는다', async () => {
    const server = alertServer([
      makeAlert({ id: 'a', title: '진행 중 알림', read: true, status: 'OPEN' }),
    ])
    stubApi(server.handlers)
    renderApp('/notifications')
    const before = await cardOf('진행 중 알림')
    expect(before.getByText('진행 중')).toBeInTheDocument()
    server.alerts[0]!.status = 'ACKNOWLEDGED'
    act(() =>
      fakeSocket.emit('alert.updated', {
        alert: makeAlert({ id: 'a', title: '진행 중 알림', status: 'ACKNOWLEDGED' }),
      }),
    )
    const after = await cardOf('진행 중 알림')
    await waitFor(() => expect(after.getByText('확인함')).toBeInTheDocument())
    expect(after.getByText('읽음')).toBeInTheDocument() // 읽음은 그대로
  })

  it('보기 조건에 맞지 않는 새 알림은 그 보기에 넣지 않는다 (중요 보기에 참고 알림이 끼지 않는다)', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications?view=important')
    await screen.findAllByRole('heading', { level: 2 })
    act(() =>
      fakeSocket.emit('alert.created', {
        alert: makeAlert({
          id: 'minor',
          title: '참고 수준 새 알림',
          severity: 'INFO',
          triggeredAt: '2026-11-13T16:00:00.000Z',
        }),
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('link', { name: '참고 수준 새 알림' })).not.toBeInTheDocument()
  })

  it('alert.read (다른 화면에서 읽음 처리)를 받으면 읽지 않은 수와 목록을 서버에서 다시 읽는다', async () => {
    const server = alertServer(THREE())
    stubApi(server.handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('3건'))

    server.alerts.forEach((alert) => {
      alert.read = true
    }) // 다른 기기에서 모두 읽음
    act(() => fakeSocket.emit('alert.read', { alertIds: [], all: true }))
    await waitFor(() => expect(summary).toHaveTextContent('0건'))
    await waitFor(() => expect(within(cardsList()).getAllByText('읽음')).toHaveLength(3))
  })

  it('연결이 끊겼다 복구되면 API 로 다시 읽어 놓친 알림을 보충한다', async () => {
    fakeSocketStatus.set('connected')
    const server = alertServer(THREE().slice(1))
    stubApi(server.handlers)
    renderApp('/notifications')
    await screen.findAllByRole('heading', { level: 2 })
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)

    // 끊겨 있는 동안 서버에 새 알림이 생겼다 (소켓 신호는 놓쳤다)
    server.alerts.unshift(
      makeAlert({
        id: 'missed',
        title: '끊겨 있는 동안 생긴 알림',
        triggeredAt: '2026-11-13T16:30:00.000Z',
      }),
    )
    act(() => fakeSocketStatus.set('disconnected'))
    act(() => fakeSocketStatus.set('connected'))
    act(() => fakeSocket.emit('connect')) // 실제 소켓이 다시 연결되며 보내는 신호
    expect(
      await screen.findByRole('link', { name: '끊겨 있는 동안 생긴 알림' }),
    ).toBeInTheDocument()
    const summary = screen.getByText('읽지 않은 알림').closest('section') as HTMLElement
    await waitFor(() => expect(summary).toHaveTextContent('3건'))
  })
})

describe('알림 센터: 빈 상태·오류·더 보기', () => {
  it.each([
    ['all', '알림이 없습니다'],
    ['unread', '읽지 않은 알림이 없습니다'],
    ['important', '중요 알림이 없습니다'],
  ])(
    '%s 보기에서 알림이 없으면 "%s" 라고 알리고, 없다고 모두 확인한 것은 아님을 밝힌다',
    async (view, title) => {
      stubApi(alertServer([]).handlers)
      renderApp(`/notifications${view === 'all' ? '' : `?view=${view}`}`)
      expect(await screen.findByText(title)).toBeInTheDocument()
      expect(
        screen.getByText(
          /확인·종료하지 않은 것이 있을 수 있습니다|모든 상황을 확인했다는 뜻은 아닙니다/,
        ),
      ).toBeInTheDocument()
    },
  )

  it('불러오지 못하면 오류와 다시 시도를 보여 주고, 실패를 "알림 없음"으로 보이지 않는다', async () => {
    let failing = true
    const server = alertServer(THREE())
    stubApi({
      ...server.handlers,
      'GET /api/alerts': () =>
        failing
          ? errorResponse(500, 'INTERNAL_ERROR', '서버 오류')
          : jsonResponse({ alerts: server.alerts, nextCursor: null }),
    })
    renderApp('/notifications')
    expect(await screen.findByText('알림을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('알림이 없습니다')).not.toBeInTheDocument()
    failing = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(3)
  })

  it('읽지 않은 수를 불러오지 못하면 0건처럼 보이지 않고 알린다', async () => {
    stubApi({
      ...alertServer(THREE()).handlers,
      'GET /api/alerts/unread-count': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/notifications')
    expect(await screen.findByText('읽지 않은 알림 수를 확인하지 못했습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '모두 읽음으로 표시' })).toBeDisabled()
    // 목록은 그대로 볼 수 있다
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(3)
  })

  it('연결이 끊겨 있고 받은 알림이 없으면 "알림 없음"이 아니라 연결 문제라고 알린다', async () => {
    fakeSocketStatus.set('disconnected')
    stubApi({
      ...alertServer(THREE()).handlers,
      'GET /api/alerts': () => new Promise<Response>(() => undefined),
    })
    renderApp('/notifications')
    expect(await screen.findByText('연결이 끊겨 알림을 볼 수 없습니다')).toBeInTheDocument()
    expect(screen.queryByText('알림이 없습니다')).not.toBeInTheDocument()
  })

  it('더 보기로 다음 쪽을 이어서 불러오고, 실패해도 이미 본 알림은 남는다', async () => {
    let failing = true
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts': ({ search }) => {
        if (!search.includes('cursor=next')) {
          return jsonResponse({
            alerts: [makeAlert({ id: 'a1', title: '첫 번째 알림' })],
            nextCursor: 'next',
          })
        }
        return failing
          ? errorResponse(500, 'INTERNAL_ERROR', '서버 오류')
          : jsonResponse({
              alerts: [makeAlert({ id: 'a2', title: '두 번째 알림' })],
              nextCursor: null,
            })
      },
    })
    renderApp('/notifications')
    await userEvent.click(await screen.findByRole('button', { name: '더 보기' }))
    expect(await screen.findByText(/다음 알림을 불러오지 못했습니다/)).toBeInTheDocument()
    expect(screen.getByText('첫 번째 알림')).toBeInTheDocument()
    failing = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('두 번째 알림')).toBeInTheDocument()
    expect(screen.getByText('첫 번째 알림')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument()
  })
})

describe('알림 상세', () => {
  const handlers = (extra: Record<string, ApiHandler> = {}) => ({
    ...loggedInHandlers(),
    'GET /api/alerts/a1': () => jsonResponse(detailBody()),
    ...extra,
  })

  it('근거 신호와 전달 결과(실제/연동 없음, 실패 이유)를 보여 준다', async () => {
    stubApi(handlers())
    renderApp('/notifications/a1')
    expect(
      await screen.findByRole('heading', { name: '현관 근처에서 움직임이 감지되었습니다' }),
    ).toBeInTheDocument()
    expect(screen.getByText('지연 수신')).toBeInTheDocument()
    expect(screen.getByText('전송 실패')).toBeInTheDocument()
    expect(screen.getByText('모든 시도가 실패했습니다.')).toBeInTheDocument()
    expect(screen.getByText('열려 있는 화면이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('연동되지 않음')).toBeInTheDocument()
    expect(screen.getByText(/이 화면이 열려 있을 때만/)).toBeInTheDocument()
  })

  it('"확인했습니다"는 확인 API 를 호출한다', async () => {
    const calls: string[] = []
    stubApi(
      handlers({
        'POST /api/alerts/a1/acknowledge': () => {
          calls.push('ack')
          return jsonResponse({ alert: makeAlert({ status: 'ACKNOWLEDGED' }) })
        },
      }),
    )
    renderApp('/notifications/a1')
    await userEvent.click(await screen.findByRole('button', { name: '확인했습니다' }))
    await waitFor(() => expect(calls).toEqual(['ack']))
  })

  it('종료할 때 결과와 메모를 보낸다', async () => {
    let body: unknown
    stubApi(
      handlers({
        'POST /api/alerts/a1/resolve': (req) => {
          body = req.body
          return jsonResponse({
            alert: makeAlert({ status: 'RESOLVED', resolution: 'FALSE_ALARM' }),
          })
        },
      }),
    )
    renderApp('/notifications/a1')
    await userEvent.click(await screen.findByRole('radio', { name: '잘못된 알림' }))
    await userEvent.type(screen.getByLabelText('메모 (선택)'), '화장실에 다녀오심')
    await userEvent.click(screen.getByRole('button', { name: '알림 종료' }))
    await waitFor(() =>
      expect(body).toEqual({ resolution: 'FALSE_ALARM', note: '화장실에 다녀오심' }),
    )
  })

  it('이미 종료된 알림(409)이면 서버 메시지를 그대로 보여 준다', async () => {
    stubApi(
      handlers({
        'POST /api/alerts/a1/acknowledge': () =>
          errorResponse(409, 'CONFLICT', '이미 종료된 알림입니다.'),
      }),
    )
    renderApp('/notifications/a1')
    await userEvent.click(await screen.findByRole('button', { name: '확인했습니다' }))
    expect(await screen.findByText('이미 종료된 알림입니다.')).toBeInTheDocument()
  })

  it('종료된 알림에는 처리 버튼이 없다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/a1': () =>
        jsonResponse(
          detailBody({
            status: 'RESOLVED',
            resolution: 'CHECKED',
            resolvedAt: '2026-11-13T16:00:00.000Z',
          }),
        ),
    })
    renderApp('/notifications/a1')
    expect(await screen.findByText('종료 (확인함)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '알림 종료' })).not.toBeInTheDocument()
  })

  it('없는 알림은 서버가 준 404 메시지를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/zzz': () => errorResponse(404, 'NOT_FOUND', '알림을 찾을 수 없습니다.'),
    })
    renderApp('/notifications/zzz')
    expect(await screen.findByText('알림을 찾을 수 없습니다.')).toBeInTheDocument()
  })
})

describe('알림 상세: 읽음·관련 기록·전달 상태', () => {
  const handlers = (overrides = {}, extra: Record<string, ApiHandler> = {}) => ({
    ...loggedInHandlers(),
    'GET /api/alerts/a1': () => jsonResponse(detailBody(overrides)),
    ...extra,
  })

  it('읽지 않은 알림은 읽음으로 표시할 수 있고, 읽어도 해결된 것이 아님을 알린다', async () => {
    let read = false
    stubApi(
      handlers(
        {},
        {
          'GET /api/alerts/a1': () => jsonResponse(detailBody({ read })),
          'POST /api/alerts/a1/read': () => {
            read = true
            return jsonResponse({ alert: makeAlert({ read: true }) })
          },
        },
      ),
    )
    renderApp('/notifications/a1')
    const card = within(
      (await screen.findByRole('heading', { name: '읽음 표시' })).closest('section')!,
    )
    expect(card.getByText('아직 읽음으로 표시하지 않았습니다.')).toBeInTheDocument()
    expect(card.getByText('읽어도 해결된 것은 아닙니다')).toBeInTheDocument()
    expect(card.getByText(/아직 진행 중 상태이며/)).toBeInTheDocument()
    await userEvent.click(card.getByRole('button', { name: '읽음으로 표시' }))
    expect(await screen.findByText('이 알림을 읽음으로 표시했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '읽음으로 표시' })).not.toBeInTheDocument()
    // 읽음 표시가 처리(확인) 버튼을 대신하지 않는다
    expect(screen.getByRole('button', { name: '확인했습니다' })).toBeInTheDocument()
  })

  it('종료된 알림에는 "읽어도 해결된 것은 아닙니다" 경고가 없다', async () => {
    stubApi(
      handlers({
        read: true,
        status: 'RESOLVED',
        resolution: 'CHECKED',
        resolvedAt: '2026-11-13T16:00:00.000Z',
      }),
    )
    renderApp('/notifications/a1')
    expect(await screen.findByText('이 알림을 읽음으로 표시했습니다.')).toBeInTheDocument()
    expect(screen.queryByText('읽어도 해결된 것은 아닙니다')).not.toBeInTheDocument()
  })

  it('읽음 표시에 실패하면 이전 상태로 되돌리고 알린다', async () => {
    stubApi(
      handlers(
        {},
        { 'POST /api/alerts/a1/read': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류') },
      ),
    )
    renderApp('/notifications/a1')
    await userEvent.click(await screen.findByRole('button', { name: '읽음으로 표시' }))
    expect(
      await screen.findByText(/읽음으로 표시하지 못해 이전 상태로 되돌렸습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('아직 읽음으로 표시하지 않았습니다.')).toBeInTheDocument()
  })

  it('관련 움직임 기록으로 이동할 수 있다', async () => {
    stubApi(handlers({ relatedEventIds: ['mov_e1'] }))
    renderApp('/notifications/a1')
    expect(await screen.findByRole('link', { name: '관련 움직임 기록 보기' })).toHaveAttribute(
      'href',
      '/events?event=mov_e1&from=2026-11-14&to=2026-11-14',
    )
  })

  it('전달 상태: 외부 서비스에 넘긴 것은 "전달 확인 불가"이고 기기 수신을 확인했다고 쓰지 않는다', async () => {
    const body = detailBody({ deliveryState: 'UNVERIFIED' })
    body.deliveries = [
      {
        id: 'p1',
        guardianId: 'g1',
        guardianName: '데모 보호자',
        channel: 'WEB_PUSH',
        providerMode: 'REAL',
        status: 'SENT',
        attempts: 1,
        lastError: null,
        sentAt: '2026-11-13T15:11:00.000Z',
        createdAt: '2026-11-13T15:10:00.000Z',
      },
      {
        id: 'i1',
        guardianId: 'g1',
        guardianName: '데모 보호자',
        channel: 'IN_APP',
        providerMode: 'REAL',
        status: 'SENT',
        attempts: 1,
        lastError: null,
        sentAt: '2026-11-13T15:10:00.000Z',
        createdAt: '2026-11-13T15:10:00.000Z',
      },
      {
        id: 's1',
        guardianId: 'g1',
        guardianName: '데모 보호자',
        channel: 'SMS',
        providerMode: null,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        sentAt: null,
        createdAt: '2026-11-13T15:10:00.000Z',
      },
    ] as typeof body.deliveries
    stubApi({ ...loggedInHandlers(), 'GET /api/alerts/a1': () => jsonResponse(body) })
    renderApp('/notifications/a1')
    const card = within(
      (await screen.findByRole('heading', { name: '알림 전달 결과' })).closest('section')!,
    )
    expect(card.getByText('전달 확인 불가')).toBeInTheDocument()
    expect(card.getByText(/기기에 도착했는지는 확인할 수 없습니다/)).toBeInTheDocument()
    expect(card.getByText('전송 성공')).toBeInTheDocument() // 앱 화면 알림
    expect(card.getByText(/보호자가 읽었다는 뜻은 아닙니다/)).toBeInTheDocument()
    expect(card.getByText('대기')).toBeInTheDocument()
    expect(card.queryByText(/기기 수신을 확인했습니다|수신 확인/)).not.toBeInTheDocument()
  })
})

describe('알림 도착 배너', () => {
  it('alert.notify 를 받으면 배너를 띄우고, 확인·종료되면 치운다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    act(() => fakeSocket.emit('alert.notify', { alert: makeAlert(), reason: 'NEW' }))
    const banner = within(await screen.findByLabelText('새 알림'))
    expect(banner.getByText('현관 근처에서 움직임이 감지되었습니다')).toBeInTheDocument()
    expect(banner.getByRole('link', { name: '알림 보기' })).toHaveAttribute(
      'href',
      '/notifications/a1',
    )

    act(() => fakeSocket.emit('alert.updated', { alert: makeAlert({ status: 'ACKNOWLEDGED' }) }))
    await waitFor(() => expect(screen.queryByLabelText('새 알림')).not.toBeInTheDocument())
  })

  it('재알림은 이유를 알리고 같은 알림을 중복으로 쌓지 않으며, 닫을 수 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    act(() => {
      fakeSocket.emit('alert.notify', { alert: makeAlert(), reason: 'NEW' })
      fakeSocket.emit('alert.notify', { alert: makeAlert(), reason: 'REMINDER' })
    })
    const banner = within(await screen.findByLabelText('새 알림'))
    expect(banner.getAllByRole('alert')).toHaveLength(1)
    expect(banner.getByText('아직 확인하지 않은 알림입니다.')).toBeInTheDocument()
    await userEvent.click(banner.getByRole('button', { name: '배너 닫기' }))
    expect(screen.queryByLabelText('새 알림')).not.toBeInTheDocument()
  })
})
