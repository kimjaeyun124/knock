import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SERVICE_LIMITS } from '@/components/common/limitsText'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { HOUSEHOLD } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  SESSION_BODY,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

const loggedOut: Record<string, ApiHandler> = {
  ...loggedInHandlers(),
  'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.'),
}

describe('서비스 안내 문구', () => {
  it('확정적 표현이 없고, 앱 화면 알림의 한계를 밝힌다', () => {
    const text = SERVICE_LIMITS.join(' ')
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
    expect(text).toContain('이 화면이 열려 있을 때만')
    expect(text).toContain('이 버전에서 연동하지 않았습니다')
  })
})

describe('첫 계정 만들기', () => {
  it('서버에 보호자가 없으면 로그인 화면에 링크가 보인다', async () => {
    stubApi({
      ...loggedOut,
      'GET /api/auth/setup-status': () => jsonResponse({ needsSetup: true }),
    })
    renderApp('/login')
    expect(await screen.findByRole('link', { name: '첫 계정 만들기' })).toHaveAttribute(
      'href',
      '/register',
    )
  })

  it('이미 보호자가 있으면 링크가 없고, /register 는 만들 수 없다고 알린다', async () => {
    stubApi({
      ...loggedOut,
      'GET /api/auth/setup-status': () => jsonResponse({ needsSetup: false }),
    })
    const first = renderApp('/login')
    await screen.findByRole('heading', { name: '로그인' })
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '첫 계정 만들기' })).not.toBeInTheDocument(),
    )
    first.unmount()

    renderApp('/register')
    expect(await screen.findByText('이미 설정된 서버입니다.')).toBeInTheDocument()
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument()
  })

  it('입력을 확인하고(길이·형식·비밀번호 일치) 틀리면 요청하지 않는다', async () => {
    const fetchMock = stubApi({
      ...loggedOut,
      'GET /api/auth/setup-status': () => jsonResponse({ needsSetup: true }),
    })
    renderApp('/register')
    await userEvent.type(await screen.findByLabelText('표시 이름'), '보호자')
    await userEvent.type(screen.getByLabelText('이메일'), 'nope')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'short')
    await userEvent.type(screen.getByLabelText('비밀번호 확인'), 'other')
    await userEvent.click(screen.getByRole('button', { name: '계정 만들기' }))
    expect(await screen.findByText('비밀번호는 12자 이상이어야 합니다.')).toBeInTheDocument()
    expect(screen.getByText('비밀번호가 서로 다릅니다.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('만들면 로그인된 상태로 초기 설정 화면으로 간다', async () => {
    let body: unknown
    let registered = false
    stubApi({
      ...loggedOut,
      'GET /api/auth/me': () =>
        registered
          ? jsonResponse(SESSION_BODY)
          : errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.'),
      'GET /api/auth/setup-status': () => jsonResponse({ needsSetup: true }),
      'POST /api/auth/register': (req) => {
        body = req.body
        registered = true
        return jsonResponse(SESSION_BODY, 201)
      },
      'GET /api/household': () => jsonResponse({ household: HOUSEHOLD }),
    })
    const { router } = renderApp('/register')
    await userEvent.type(await screen.findByLabelText('표시 이름'), '첫 보호자')
    await userEvent.type(screen.getByLabelText('이메일'), 'first@example.com')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'a-long-enough-password')
    await userEvent.type(screen.getByLabelText('비밀번호 확인'), 'a-long-enough-password')
    await userEvent.click(screen.getByRole('button', { name: '계정 만들기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'))
    expect(body).toEqual({
      email: 'first@example.com',
      password: 'a-long-enough-password',
      displayName: '첫 보호자',
    })
  })

  it('서버가 거부하면(403) 메시지를 보여 준다', async () => {
    stubApi({
      ...loggedOut,
      'GET /api/auth/setup-status': () => jsonResponse({ needsSetup: true }),
      'POST /api/auth/register': () =>
        errorResponse(403, 'FORBIDDEN', '이미 설정된 서버입니다. 계정은 기존 보호자가 관리합니다.'),
    })
    renderApp('/register')
    await userEvent.type(await screen.findByLabelText('표시 이름'), '보호자')
    await userEvent.type(screen.getByLabelText('이메일'), 'a@example.com')
    await userEvent.type(screen.getByLabelText('비밀번호'), 'a-long-enough-password')
    await userEvent.type(screen.getByLabelText('비밀번호 확인'), 'a-long-enough-password')
    await userEvent.click(screen.getByRole('button', { name: '계정 만들기' }))
    expect(await screen.findByText(/이미 설정된 서버입니다. 계정은/)).toBeInTheDocument()
  })
})

describe('홈의 초기 설정 안내', () => {
  it('초기 설정을 마치지 않았으면 이어서 하라고 안내한다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/household': () => jsonResponse({ household: HOUSEHOLD }),
    })
    renderApp('/')
    expect(await screen.findByText('초기 설정을 마치지 않았습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '초기 설정 이어서 하기' })).toHaveAttribute(
      'href',
      '/onboarding',
    )
  })

  it('마쳤으면 안내하지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/household': () =>
        jsonResponse({ household: { ...HOUSEHOLD, setupCompleted: true } }),
    })
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    await waitFor(() =>
      expect(screen.queryByText('초기 설정을 마치지 않았습니다')).not.toBeInTheDocument(),
    )
  })
})
