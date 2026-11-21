import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  SESSION_BODY,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

const notLoggedIn: Record<string, ApiHandler> = {
  ...loggedInHandlers(),
  'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.'),
}

describe('로그인 화면과 인증 가드', () => {
  it('로그인하지 않고 보호된 화면에 가면 로그인 화면으로 보낸다', async () => {
    stubApi(notLoggedIn)
    const { router } = renderApp('/sensors')
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: '센서 관리' })).not.toBeInTheDocument()
  })

  it('로그인에 성공하면 원래 가려던 화면으로 돌아간다', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi({
      ...notLoggedIn,
      'POST /api/auth/login': () => jsonResponse(SESSION_BODY),
    })
    const { router } = renderApp('/sensors')

    await user.type(await screen.findByLabelText('이메일'), 'demo@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'some-password')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '센서 관리' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sensors')

    const loginCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    const sentBody = loginCall?.[1]?.body
    expect(JSON.parse(typeof sentBody === 'string' ? sentBody : '{}')).toEqual({
      email: 'demo@example.com',
      password: 'some-password',
    })
  })

  it('로그인에 실패하면 서버가 준 안내 문구를 보여 주고 로그인되지 않는다', async () => {
    const user = userEvent.setup()
    stubApi({
      ...notLoggedIn,
      'POST /api/auth/login': () =>
        errorResponse(401, 'UNAUTHORIZED', '이메일 또는 비밀번호가 올바르지 않습니다.'),
    })
    const { router } = renderApp('/login')

    await user.type(await screen.findByLabelText('이메일'), 'demo@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    )
    expect(router.state.location.pathname).toBe('/login')
  })

  it('로그인 시도가 너무 많아 제한되면 그 안내를 그대로 보여 준다', async () => {
    const user = userEvent.setup()
    stubApi({
      ...notLoggedIn,
      'POST /api/auth/login': () =>
        errorResponse(
          429,
          'RATE_LIMITED',
          '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.',
        ),
    })
    renderApp('/login')
    await user.type(await screen.findByLabelText('이메일'), 'demo@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'x')
    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('15분 뒤에 다시 시도')
  })

  it('입력이 비어 있으면 서버에 요청하지 않고 안내한다', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi(notLoggedIn)
    renderApp('/login')
    await user.click(await screen.findByRole('button', { name: '로그인' }))
    expect(screen.getByRole('alert')).toHaveTextContent('이메일과 비밀번호를 모두 입력해 주세요.')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('서버에 연결할 수 없으면 "로그아웃된 것"으로 처리하지 않고 확인 실패를 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/auth/me': () => new Response('', { status: 500 }),
    })
    const { router } = renderApp('/')
    expect(await screen.findByText('로그인 상태를 확인하지 못했습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('외부 주소로 보내는 redirect 값은 무시한다', async () => {
    const user = userEvent.setup()
    stubApi({
      ...notLoggedIn,
      'POST /api/auth/login': () => jsonResponse(SESSION_BODY),
    })
    const { router } = renderApp({ pathname: '/login', state: { from: '//evil.example' } })
    await user.type(await screen.findByLabelText('이메일'), 'demo@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'x')
    await user.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('로그아웃', () => {
  it('서버에서 로그아웃에 성공하면 로그인 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    let loggedOut = false
    stubApi({
      ...loggedInHandlers(),
      'GET /api/auth/me': () =>
        loggedOut
          ? errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
          : jsonResponse(SESSION_BODY),
      'POST /api/auth/logout': () => {
        loggedOut = true
        return jsonResponse({ ok: true })
      },
    })
    const { router } = renderApp('/')
    await user.click(await screen.findByRole('button', { name: '로그아웃' }))
    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('로그아웃 요청이 실패하면 로그아웃된 것처럼 보이지 않고 실패를 알린다', async () => {
    const user = userEvent.setup()
    stubApi({
      ...loggedInHandlers(),
      'POST /api/auth/logout': () => new Response('', { status: 500 }),
    })
    const { router } = renderApp('/')
    await user.click(await screen.findByRole('button', { name: '로그아웃' }))
    expect(await screen.findByText(/로그아웃하지 못했습니다/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })
})
