import { act, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fakeSocket, fakeSocketStatus } from '@/test/fakeSocket'
import { makeAlert, makeSensor } from '@/test/fixtures'
import { composeApiClient } from '@/services/api/features'
import { createHttpApiClient } from '@/services/api/http'
import { createMockApiClient } from '@/services/api/mock'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  testRuntime,
} from '@/test/helpers'

describe('라우팅과 연결 상태 표시 (로그인한 상태)', () => {
  it('서버가 정상이고 실시간 연결도 살아 있으면 "연결 정상"을 보여 준다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(await screen.findByText('연결 정상')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
    expect(screen.queryByLabelText('연결 안내')).not.toBeInTheDocument()
  })

  it('처음 연결하는 동안은 "연결 중"이고, 보여 줄 이전 정보가 없으므로 안내를 띄우지 않는다', async () => {
    stubApi(loggedInHandlers()) // 실시간 연결이 아직 만들어지지 않았다
    renderApp('/')
    expect(await screen.findByText('연결 중')).toBeInTheDocument()
    expect(screen.queryByText('연결 정상')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('연결 안내')).not.toBeInTheDocument()
  })

  it('서버에 연결할 수 없으면 "연결 끊김"으로 알리고 지금 상태로 믿지 말라고 안내한다', async () => {
    fakeSocketStatus.set('connected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/health': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderApp('/')
    expect(await screen.findByText('연결 끊김')).toBeInTheDocument()
    expect(screen.queryByText('연결 정상')).not.toBeInTheDocument()
    const notice = within(await screen.findByLabelText('연결 안내'))
    expect(notice.getByText('연결이 끊겨 최신 정보를 받지 못하고 있습니다')).toBeInTheDocument()
    expect(notice.getByText(/지금 상태로 믿지 마세요/)).toBeInTheDocument()
  })

  it('서버가 500을 응답하면 "연결 정상"이 아니라 "연결 확인 불가"로 알린다', async () => {
    fakeSocketStatus.set('connected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/health': () => new Response('', { status: 500 }),
    })
    renderApp('/')
    expect(await screen.findByText('연결 확인 불가')).toBeInTheDocument()
    expect(screen.queryByText('연결 정상')).not.toBeInTheDocument()
    expect(await screen.findByText('서버 상태를 확인하지 못했습니다')).toBeInTheDocument()
  })

  it('DB 장애(503)의 구체적인 안내 문구를 그대로 보여 준다', async () => {
    fakeSocketStatus.set('connected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/health': () =>
        errorResponse(503, 'SERVICE_UNAVAILABLE', '데이터베이스에 연결할 수 없습니다.'),
    })
    renderApp('/')
    expect(await screen.findAllByText(/데이터베이스에 연결할 수 없습니다\./)).not.toHaveLength(0)
    expect(screen.queryByText('연결 정상')).not.toBeInTheDocument()
  })

  it('실시간 연결이 끊기면 서버가 정상이어도 "연결 끊김"이고, 언제까지 확인한 정보인지 알린다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(await screen.findByText('연결 정상')).toBeInTheDocument()

    act(() => fakeSocketStatus.set('disconnected'))

    expect(await screen.findByText('연결 끊김')).toBeInTheDocument()
    expect(screen.queryByText('연결 정상')).not.toBeInTheDocument()
    const notice = within(await screen.findByLabelText('연결 안내'))
    // 끊기기 전에 받은 정보는 "까지 확인한 정보"라고 밝힌다. (지금 상태처럼 보이지 않게)
    expect(
      await notice.findByText(/까지 확인한 정보이며, 지금 상태와 다를 수 있습니다/),
    ).toBeInTheDocument()

    act(() => fakeSocketStatus.set('connected'))
    expect(await screen.findByText('연결 정상')).toBeInTheDocument()
    expect(screen.queryByLabelText('연결 안내')).not.toBeInTheDocument()
  })

  it('브라우저가 인터넷 끊김을 알리면 "연결 끊김"으로 바뀐다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(await screen.findByText('연결 정상')).toBeInTheDocument()

    const onLine = vi.spyOn(navigator, 'onLine', 'get')
    try {
      onLine.mockReturnValue(false)
      act(() => {
        window.dispatchEvent(new Event('offline'))
      })
      expect(await screen.findByText('연결 끊김')).toBeInTheDocument()
      expect(screen.getByText('인터넷 연결이 끊겨 있습니다.')).toBeInTheDocument()
    } finally {
      // TanStack Query 도 이 신호로 "오프라인"이 되므로, 다음 테스트를 위해 되돌려 놓는다.
      onLine.mockRestore()
      act(() => {
        window.dispatchEvent(new Event('online'))
      })
    }
  })

  it('없는 경로는 404 안내를 보여 준다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/no-such-page')
    expect(
      await screen.findByRole('heading', { name: '페이지를 찾을 수 없습니다' }),
    ).toBeInTheDocument()
  })

  it('로그인한 보호자의 이름과 로그아웃 버튼을 보여 준다', async () => {
    stubApi({ ...loggedInHandlers(), 'GET /api/health': () => jsonResponse({}) })
    renderApp('/')
    expect(await screen.findByText('데모 보호자')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
})

describe('연결이 끊겼을 때의 홈', () => {
  it('실시간 연결이 끊기면 다시 확인하고, 실패하면 마지막으로 확인한 상태만 덧붙여 알린다', async () => {
    let failing = false
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () =>
        failing
          ? errorResponse(503, 'SERVICE_UNAVAILABLE', '서버에 연결할 수 없습니다.')
          : jsonResponse({ sensors: [makeSensor()] }),
      'GET /api/alerts': () => jsonResponse({ alerts: [makeAlert()], nextCursor: null }),
    })
    renderApp('/')
    expect(await screen.findByRole('alert', { name: '현재 상태' })).toBeInTheDocument()

    failing = true
    fakeSocket.emit('disconnect')

    expect(await screen.findByText('상태 확인 불가')).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: '현재 상태' })).not.toBeInTheDocument()
    expect(screen.getByText(/마지막으로 확인한 상태: 즉시 확인 권장/)).toBeInTheDocument()
  })
})

describe('계획서의 모든 경로가 열린다', () => {
  it.each([
    ['/', '대시보드'],
    ['/notifications', '알림 센터'],
    ['/notifications/a1', '알림 상세'],
    ['/events', '움직임 기록'],
    ['/sensors', '센서 관리'],
    ['/sensors/new', '센서 등록'],
    ['/sensors/s1', '센서 상세'],
    ['/settings', '설정'],
    ['/settings/detection', '감지 시간·민감도'],
    ['/settings/notifications', '알림 채널'],
    ['/settings/integrations', '연동 현황'],
    ['/settings/password', '비밀번호 변경'],
    ['/settings/data', '데이터 관리'],
    ['/onboarding', '초기 설정'],
  ])('%s → %s', async (path, heading) => {
    stubApi(loggedInHandlers())
    renderApp(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('서비스 안내(/notice)는 로그인하지 않아도 열린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.'),
    })
    const { router } = renderApp('/notice')
    expect(await screen.findByRole('heading', { name: '서비스 안내와 한계' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/notice')
  })

  it('설정 홈에서 하위 설정 화면으로 이동할 수 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/settings')
    const links = await screen.findAllByRole('link', {
      name: /감지 시간·민감도|^알림 채널|연동 현황|비밀번호 변경|데이터 관리/,
    })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/settings/detection',
      '/settings/notifications',
      '/settings/integrations',
      '/settings/password',
      '/settings/data',
    ])
  })
})

describe('연동 현황: 서버에 없는 기능과 Mock 표시', () => {
  it('Mock 을 켜지 않으면 서버가 밝힌 연동 상태를 그대로 보여 주고 샘플 표시가 없다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/integrations': () =>
        jsonResponse({
          integrations: [
            { key: 'IN_APP', mode: 'REAL', lastSuccessAt: '2026-11-14T15:00:00.000Z' },
            { key: 'WEB_PUSH', mode: 'REAL', lastSuccessAt: null },
            { key: 'SMS', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
            { key: 'KAKAO', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
          ],
        }),
    })
    renderApp('/settings/integrations')
    expect(await screen.findByText('앱 화면 알림')).toBeInTheDocument()
    expect(screen.getAllByText('실제 연동')).toHaveLength(2)
    expect(screen.getAllByText('연동되지 않음')).toHaveLength(2)
    expect(screen.getByText(/마지막 전달 성공: /)).toBeInTheDocument()
    expect(screen.getAllByText('전달에 성공한 기록이 없습니다.')).toHaveLength(3)
    expect(screen.queryByText('샘플 데이터')).not.toBeInTheDocument()
  })

  it('연동 현황을 불러오지 못하면 목록을 지어내지 않고 오류를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/integrations': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      'GET /api/system/sensor-adapters': () => jsonResponse({ adapters: [] }),
    })
    renderApp('/settings/integrations')
    expect(await screen.findByText('불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('실제 연동')).not.toBeInTheDocument()
  })

  it('Mock 을 켜면 샘플임을 밝히고 세 가지 연동 방식(실제·가짜 응답·연동되지 않음)을 모두 보여 준다', async () => {
    stubApi(loggedInHandlers())
    const client = composeApiClient(createHttpApiClient(), createMockApiClient(), ['integrations'])
    renderApp('/settings/integrations', testRuntime({ client, mockFeatures: ['integrations'] }))
    expect(await screen.findByText('앱 화면 알림')).toBeInTheDocument()
    expect(screen.getByText('샘플 데이터')).toBeInTheDocument()
    expect(screen.getByText(/실제 연동 상태가 아닙니다/)).toBeInTheDocument()
    expect(screen.getByText('실제 연동')).toBeInTheDocument()
    expect(screen.getByText('가짜 응답(테스트용)')).toBeInTheDocument()
    // 브라우저 푸시·스마트워치·카카오 (스마트워치는 아직 연동하지 않은 채널)
    expect(screen.getAllByText('연동되지 않음')).toHaveLength(3)
    expect(screen.getAllByText('일부 화면이 샘플 데이터입니다').length).toBeGreaterThan(0)
  })
})
