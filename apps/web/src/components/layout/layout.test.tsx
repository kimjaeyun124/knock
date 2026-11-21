import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildTrail } from '@/app/routeHandle'
import { fakeSocketStatus } from '@/test/fakeSocket'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

const sidebar = async () => within(await screen.findByRole('navigation', { name: '주요 메뉴' }))
const bottom = async () => within(await screen.findByRole('navigation', { name: '하단 메뉴' }))

describe('공통 레이아웃: 내비게이션', () => {
  it('사이드바에는 핵심 메뉴 4개가 위에, 설정과 서비스 안내가 아래에 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    const menu = await sidebar()
    expect(menu.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['대시보드', '/'],
      ['센서 관리', '/sensors'],
      ['움직임 기록', '/events'],
      ['알림 센터', '/notifications'],
      ['설정', '/settings'],
      ['서비스 안내와 한계', '/notice'],
    ])
  })

  it('모바일 하단 메뉴에는 핵심 화면 4개와 설정이 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    const menu = await bottom()
    expect(menu.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['홈', '/'],
      ['센서', '/sensors'],
      ['기록', '/events'],
      ['알림', '/notifications'],
      ['설정', '/settings'],
    ])
  })

  it('현재 위치를 aria-current 로 알리고, 하위 화면에서도 상위 메뉴가 현재 위치로 표시된다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors/new')
    const current = (await sidebar()).getAllByRole('link', { current: 'page' })
    expect(current.map((a) => a.textContent)).toEqual(['센서 관리'])
    expect((await bottom()).getByRole('link', { current: 'page' })).toHaveTextContent('센서')
  })

  it('대시보드 메뉴는 다른 화면에서 현재 위치로 표시되지 않는다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/events')
    const current = (await sidebar()).getAllByRole('link', { current: 'page' })
    expect(current.map((a) => a.textContent)).toEqual(['움직임 기록'])
  })

  it('설정 하위 화면(/settings/notifications)은 알림 센터가 아니라 설정이 현재 위치다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/settings/notifications')
    const current = (await sidebar()).getAllByRole('link', { current: 'page' })
    expect(current.map((a) => a.textContent)).toEqual(['설정'])
  })

  it('로고는 서비스 이름과 함께 대시보드로 이어진다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/events')
    const links = await screen.findAllByRole('link', { name: '노크' })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', '/')
  })
})

describe('공통 레이아웃: 이동 경로(Breadcrumbs)', () => {
  it('최상위 화면에는 이동 경로가 없다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors')
    await screen.findByRole('heading', { name: '센서 관리' })
    expect(screen.queryByRole('navigation', { name: '현재 위치' })).not.toBeInTheDocument()
  })

  it('두 단계 이상 들어온 화면에는 상위 화면으로 돌아가는 경로가 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/settings/detection')
    const trail = within(await screen.findByRole('navigation', { name: '현재 위치' }))
    expect(trail.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/settings')
    expect(trail.getByText('감지 시간·민감도')).toHaveAttribute('aria-current', 'page')
  })

  it('센서 등록은 "센서 관리 > 센서 등록", 알림 상세는 "알림 센터 > 알림 상세"이다', async () => {
    stubApi(loggedInHandlers())
    const first = renderApp('/sensors/new')
    const sensors = within(await screen.findByRole('navigation', { name: '현재 위치' }))
    expect(sensors.getByRole('link', { name: '센서 관리' })).toHaveAttribute('href', '/sensors')
    expect(sensors.getByText('센서 등록')).toHaveAttribute('aria-current', 'page')
    first.unmount()

    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/a1': () => errorResponse(404, 'NOT_FOUND', '없음'),
    })
    renderApp('/notifications/a1')
    const alerts = within(await screen.findByRole('navigation', { name: '현재 위치' }))
    expect(alerts.getByRole('link', { name: '알림 센터' })).toHaveAttribute(
      'href',
      '/notifications',
    )
    expect(alerts.getByText('알림 상세')).toHaveAttribute('aria-current', 'page')
  })

  it('개발용 화면은 설정 아래에 있는 것으로 보여 준다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/dev/design')
    const trail = within(await screen.findByRole('navigation', { name: '현재 위치' }))
    expect(trail.getByRole('link', { name: '설정' })).toHaveAttribute('href', '/settings')
    expect(trail.getByText('디자인 시스템')).toBeInTheDocument()
  })

  it('buildTrail: 같은 경로가 겹쳐도 한 번만 넣고, 화면 정보가 없는 경로는 건너뛴다', () => {
    const { crumbs, current } = buildTrail([
      { pathname: '/' },
      { pathname: '/settings', handle: { title: '설정' } },
      { pathname: '/settings', handle: { title: '설정' } },
      { pathname: '/settings/data', handle: { title: '데이터 관리' } },
    ])
    expect(crumbs).toEqual([
      { title: '설정', to: '/settings' },
      { title: '데이터 관리', to: '/settings/data' },
    ])
    expect(current?.title).toBe('데이터 관리')
  })
})

describe('공통 레이아웃: 탭 제목과 화면 이동 안내', () => {
  it('탭 제목이 현재 화면 이름을 따라간다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/events')
    await waitFor(() => expect(document.title).toBe('움직임 기록 · 노크'))
  })

  it('화면 이름을 스크린리더에 읽어 주는 영역이 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/settings')
    await screen.findByRole('heading', { name: '설정' })
    expect(screen.getByText('설정 화면')).toBeInTheDocument()
  })

  it('로그인 전 화면(서비스 안내)에도 탭 제목이 붙는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.'),
    })
    renderApp('/notice')
    await waitFor(() => expect(document.title).toBe('서비스 안내와 한계 · 노크'))
  })
})

describe('공통 레이아웃: 예전 주소', () => {
  it.each([
    ['/alerts', '/notifications'],
    ['/alerts/a1', '/notifications/a1'],
    ['/alerts/a%2Fb?from=push#top', '/notifications/a%2Fb?from=push#top'],
    ['/history', '/events'],
    ['/history?date=2026-11-13', '/events?date=2026-11-13'],
    ['/setup', '/onboarding'],
  ])('%s 는 %s 로 넘어간다', async (from, to) => {
    stubApi(loggedInHandlers())
    const { router } = renderApp(from)
    await waitFor(() => {
      const { pathname, search, hash } = router.state.location
      expect(`${pathname}${search}${hash}`).toBe(to)
    })
  })

  it('넘어간 뒤 뒤로 가기를 눌러도 예전 주소에 갇히지 않는다 (replace)', async () => {
    stubApi(loggedInHandlers())
    const { router } = renderApp('/history')
    await waitFor(() => expect(router.state.location.pathname).toBe('/events'))
    expect(router.state.historyAction).toBe('REPLACE')
  })
})

describe('공통 레이아웃: 알림 센터 버튼', () => {
  // 사이드바에도 같은 이름의 메뉴가 있으므로 공통 헤더(첫 번째 banner) 안에서만 찾는다.
  const trigger = async (name: string | RegExp) =>
    within((await screen.findAllByRole('banner'))[0]!).findByRole('link', { name })

  it('내가 읽지 않은 알림 수를 보여 준다 (처리 상태와 상관없이)', async () => {
    fakeSocketStatus.set('connected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/unread-count': () => jsonResponse({ unread: 2, unreadImportant: 0 }),
    })
    renderApp('/sensors')
    const link = await trigger(/^알림 센터\. 읽지 않은 알림\s*2\s*건$/)
    expect(link).toHaveAttribute('href', '/notifications')
    expect(link).toHaveTextContent('2')
  })

  it('중요한 알림을 읽지 않았으면 숫자가 붉은색, 아니면 기본 색이다', async () => {
    fakeSocketStatus.set('connected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/unread-count': () => jsonResponse({ unread: 3, unreadImportant: 1 }),
    })
    const first = renderApp('/sensors')
    const urgent = await trigger(/읽지 않은 알림\s*3\s*건/)
    expect(urgent.querySelector('.bg-status-danger')).not.toBeNull()
    first.unmount()

    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/unread-count': () => jsonResponse({ unread: 3, unreadImportant: 0 }),
    })
    renderApp('/sensors')
    const plain = await trigger(/읽지 않은 알림\s*3\s*건/)
    expect(plain.querySelector('.bg-status-danger')).toBeNull()
  })

  it('읽지 않은 알림이 없으면 숫자 없이 알림 센터로만 이어진다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(loggedInHandlers())
    renderApp('/sensors')
    const link = await trigger('알림 센터')
    expect(link).toHaveAccessibleName('알림 센터')
    expect(link).not.toHaveTextContent(/\d/)
  })

  it('읽지 않은 수를 불러오지 못하면 0건처럼 보이지 않고 확인하지 못한다고 알린다', async () => {
    fakeSocketStatus.set('connected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/unread-count': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/sensors')
    await trigger('알림 센터. 새 알림을 확인하지 못하고 있습니다')
  })

  it('연결이 끊겨 있으면 이전에 받은 건수를 현재 값처럼 보여 주지 않는다', async () => {
    fakeSocketStatus.set('disconnected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts/unread-count': () => jsonResponse({ unread: 5, unreadImportant: 2 }),
    })
    renderApp('/sensors')
    const link = await trigger('알림 센터. 새 알림을 확인하지 못하고 있습니다')
    expect(link).not.toHaveTextContent(/\d/) // 이전에 받은 건수를 숫자로 보여 주지 않는다
  })
})

describe('연결 실패 안내: 재연결 시도와 마지막 연결 시각', () => {
  it('연결이 끊겨 재연결을 시도하는 동안 몇 번째 시도인지와 마지막 오류를 알린다', async () => {
    fakeSocketStatus.set('disconnected')
    fakeSocketStatus.setInfo({
      reconnectAttempts: 3,
      lastError: 'xhr poll error',
      lastDisconnectedAt: new Date('2026-11-17T01:00:00Z'),
    })
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(
      await screen.findByText(
        /실시간 연결을 3번째 다시 시도하고 있습니다\.\s*\(마지막 오류: xhr poll error\)/,
      ),
    ).toBeInTheDocument()
  })
})
