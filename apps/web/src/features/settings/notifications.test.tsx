import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { fakeSocket } from '@/test/fakeSocket'
import {
  errorResponse,
  INTEGRATIONS_BODY,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

const withPush = (extra: Record<string, ApiHandler> = {}) => ({
  ...loggedInHandlers(),
  'GET /api/system/integrations': () =>
    jsonResponse({
      integrations: INTEGRATIONS_BODY.integrations.map((i) =>
        i.key === 'WEB_PUSH' ? { ...i, mode: 'REAL' } : i,
      ),
    }),
  'GET /api/push/config': () => jsonResponse({ configured: true, publicKey: 'BPublicKeyForTests' }),
  'GET /api/push/subscriptions': () => jsonResponse({ subscriptions: [] }),
  ...extra,
})

const testResult = (channel: string, status: string, error: string | null = null) =>
  jsonResponse({
    channel,
    status,
    mode: status === 'NOT_CONFIGURED' ? null : 'REAL',
    error,
    testedAt: '2026-11-15T00:00:00.000Z',
  })

describe('홈의 전달 한계 안내', () => {
  it('화면 밖으로 알림을 보낼 방법이 연동되어 있지 않으면 항상 알린다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(
      await screen.findByText('이 화면을 닫아 두면 알림을 받을 수 없습니다'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '알림 채널 설정 보기' })).toHaveAttribute(
      'href',
      '/settings/notifications',
    )
  })

  it('푸시가 연동되어 있으면 알리지 않는다', async () => {
    stubApi(withPush())
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    await screen.findByText('아직 등록된 센서가 없습니다') // 대시보드가 다 그려진 뒤에도 안내가 없어야 한다
    expect(
      screen.queryByText('이 화면을 닫아 두면 알림을 받을 수 없습니다'),
    ).not.toBeInTheDocument()
  })

  it('연동 현황을 확인하지 못했을 때는 추측해서 알리지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/integrations': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    expect(
      screen.queryByText('이 화면을 닫아 두면 알림을 받을 수 없습니다'),
    ).not.toBeInTheDocument()
  })
})

describe('알림 채널 화면: 테스트 발송', () => {
  it('연동되지 않은 채널에는 테스트 버튼이 없고, 한계를 알린다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/settings/notifications')
    expect(
      await screen.findByRole('button', { name: '앱 화면 알림 테스트 보내기' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '브라우저 푸시 테스트 보내기' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '문자 메시지 테스트 보내기' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('앱 화면 알림의 한계')).toBeInTheDocument()
    expect(screen.getAllByText('연동되지 않음')).toHaveLength(3)
  })

  it('테스트 결과가 성공이면 전달되었다고, 앱 화면은 실제로 도착했을 때만 도착했다고 알린다', async () => {
    let body: unknown
    stubApi({
      ...loggedInHandlers(),
      'POST /api/notifications/test': (req) => {
        body = req.body
        return testResult('IN_APP', 'SENT')
      },
    })
    renderApp('/settings/notifications')
    await userEvent.click(await screen.findByRole('button', { name: '앱 화면 알림 테스트 보내기' }))
    expect(await screen.findByText('전달되었습니다.')).toBeInTheDocument()
    expect(body).toEqual({ channel: 'IN_APP' })
    // 서버가 "보냈다"고 해도 화면에 실제로 도착하기 전에는 도착했다고 하지 않는다
    expect(screen.queryByText('이 화면에 테스트 알림이 도착했습니다.')).not.toBeInTheDocument()
    act(() => fakeSocket.emit('notification.test', { sentAt: '2026-11-15T00:00:00.000Z' }))
    expect(await screen.findByText('이 화면에 테스트 알림이 도착했습니다.')).toBeInTheDocument()
  })

  it('전달 실패는 이유와 함께 경고로 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'POST /api/notifications/test': () =>
        testResult('IN_APP', 'FAILED', '테스트를 받을 앱 화면이 열려 있지 않습니다.'),
    })
    renderApp('/settings/notifications')
    await userEvent.click(await screen.findByRole('button', { name: '앱 화면 알림 테스트 보내기' }))
    const alert = await screen.findByText(/전달하지 못했습니다\. 테스트를 받을 앱 화면이 열려/)
    expect(alert.closest('[role="alert"]')).not.toBeNull()
  })

  it('요청 자체가 실패하면(429 등) 서버 메시지를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'POST /api/notifications/test': () =>
        errorResponse(
          429,
          'RATE_LIMITED',
          '테스트를 너무 자주 보내고 있습니다. 잠시 후 다시 시도해 주세요.',
        ),
    })
    renderApp('/settings/notifications')
    await userEvent.click(await screen.findByRole('button', { name: '앱 화면 알림 테스트 보내기' }))
    expect(await screen.findByText(/테스트를 너무 자주 보내고 있습니다/)).toBeInTheDocument()
  })

  it('테스트가 성공하면 마지막 전달 성공 시각을 다시 읽는다', async () => {
    let lastSuccessAt: string | null = null
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/integrations': () =>
        jsonResponse({
          integrations: INTEGRATIONS_BODY.integrations.map((i) =>
            i.key === 'IN_APP' ? { ...i, lastSuccessAt } : i,
          ),
        }),
      'POST /api/notifications/test': () => {
        lastSuccessAt = '2026-11-14T15:00:00.000Z'
        return testResult('IN_APP', 'SENT')
      },
    })
    renderApp('/settings/notifications')
    expect((await screen.findAllByText('전달에 성공한 기록이 없습니다.')).length).toBe(4)
    await userEvent.click(screen.getByRole('button', { name: '앱 화면 알림 테스트 보내기' }))
    expect(await screen.findByText(/마지막 전달 성공: /)).toBeInTheDocument()
  })

  it('채널 상태를 불러오지 못하면 오류를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/integrations': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/settings/notifications')
    expect(await screen.findByText('채널 상태를 불러오지 못했습니다')).toBeInTheDocument()
  })
})

describe('알림 채널 화면: 이 기기에서 푸시 받기', () => {
  it('서버에 푸시가 설정되어 있지 않으면 그 사실과 한계를 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/push/config': () => jsonResponse({ configured: false, publicKey: null }),
    })
    renderApp('/settings/notifications')
    expect(
      await screen.findByText('서버에 브라우저 푸시가 설정되어 있지 않습니다'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이 기기에서 푸시 받기' })).not.toBeInTheDocument()
  })

  it('이 브라우저가 푸시를 지원하지 않으면 안내한다 (iPhone·iPad 포함)', async () => {
    stubApi(withPush())
    renderApp('/settings/notifications')
    expect(await screen.findByText('이 브라우저는 푸시를 지원하지 않습니다')).toBeInTheDocument()
    expect(screen.getAllByText(/홈 화면에 추가/).length).toBeGreaterThan(0)
  })

  describe('브라우저가 푸시를 지원할 때', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'serviceWorker')
      window.localStorage.clear()
    })

    function installBrowser(permission: 'granted' | 'denied' = 'granted') {
      let current: object | null = null
      const subscription = {
        endpoint: 'https://push.example.com/send/this-device',
        toJSON: () => ({
          endpoint: subscription.endpoint,
          keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
        }),
        unsubscribe: vi.fn(() => {
          current = null
          return Promise.resolve(true)
        }),
      }
      const registration = {
        pushManager: {
          getSubscription: () => Promise.resolve(current),
          subscribe: vi.fn(() => {
            current = subscription
            return Promise.resolve(subscription)
          }),
        },
      }
      const requestPermission = vi.fn(() => Promise.resolve(permission))
      vi.stubGlobal('Notification', { permission: 'default', requestPermission })
      vi.stubGlobal('PushManager', class {})
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          register: vi.fn(() => Promise.resolve(registration)),
          ready: Promise.resolve(registration),
          getRegistration: () => Promise.resolve(current ? registration : undefined),
        },
      })
      return { subscription, registration, requestPermission }
    }

    it('권한을 요청하고 구독해 서버에 등록한다', async () => {
      const browser = installBrowser()
      let body: unknown
      let registered = false
      stubApi(
        withPush({
          'GET /api/push/subscriptions': () =>
            jsonResponse({
              subscriptions: registered
                ? [{ id: 'sub-1', host: 'push.example.com', createdAt: '2026-11-15T00:00:00.000Z' }]
                : [],
            }),
          'POST /api/push/subscribe': (req) => {
            body = req.body
            registered = true
            return jsonResponse(
              {
                subscription: {
                  id: 'sub-1',
                  host: 'push.example.com',
                  createdAt: '2026-11-15T00:00:00.000Z',
                },
              },
              201,
            )
          },
        }),
      )
      renderApp('/settings/notifications')
      await userEvent.click(await screen.findByRole('button', { name: '이 기기에서 푸시 받기' }))
      expect(
        await screen.findByText(/이 기기는 푸시를 받도록 등록되어 있습니다/),
      ).toBeInTheDocument()
      expect(browser.requestPermission).toHaveBeenCalledOnce()
      expect(body).toEqual({
        endpoint: 'https://push.example.com/send/this-device',
        keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
      })
      // 브라우저에는 서버가 알려 준 공개 키(바이트 배열로 바꾼 것)로 구독한다
      const options = (
        browser.registration.pushManager.subscribe.mock.calls as unknown as unknown[][]
      )[0]?.[0] as {
        userVisibleOnly: boolean
        applicationServerKey: Uint8Array
      }
      expect(options.userVisibleOnly).toBe(true)
      expect(options.applicationServerKey).toBeInstanceOf(Uint8Array)
      expect(window.localStorage.getItem('tetris.pushSubscriptionId')).toBe('sub-1')
    })

    it('권한을 거부하면 등록하지 않고 이유를 알린다', async () => {
      installBrowser('denied')
      const fetchMock = stubApi(withPush())
      renderApp('/settings/notifications')
      await userEvent.click(await screen.findByRole('button', { name: '이 기기에서 푸시 받기' }))
      expect(await screen.findByText(/알림 권한이 허용되지 않았습니다/)).toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
      expect(screen.queryByText(/푸시를 받도록 등록되어 있습니다/)).not.toBeInTheDocument()
    })

    it('서버가 등록을 거부하면 등록된 것처럼 보이지 않는다', async () => {
      installBrowser()
      stubApi(
        withPush({
          'POST /api/push/subscribe': () =>
            errorResponse(400, 'BAD_REQUEST', '푸시 서비스 주소가 올바르지 않습니다.'),
        }),
      )
      renderApp('/settings/notifications')
      await userEvent.click(await screen.findByRole('button', { name: '이 기기에서 푸시 받기' }))
      expect(await screen.findByText('푸시 서비스 주소가 올바르지 않습니다.')).toBeInTheDocument()
      expect(screen.getByText(/이 기기는 아직 등록되지 않았습니다/)).toBeInTheDocument()
    })

    it('등록을 해제하면 서버와 브라우저 모두에서 지운다', async () => {
      const browser = installBrowser()
      window.localStorage.setItem('tetris.pushSubscriptionId', 'sub-1')
      await browser.registration.pushManager.subscribe()
      const calls: string[] = []
      let removed = false
      stubApi(
        withPush({
          'GET /api/push/subscriptions': () =>
            jsonResponse({
              subscriptions: removed
                ? []
                : [
                    {
                      id: 'sub-1',
                      host: 'push.example.com',
                      createdAt: '2026-11-15T00:00:00.000Z',
                    },
                  ],
            }),
          'DELETE /api/push/subscriptions/sub-1': () => {
            calls.push('delete')
            removed = true
            return jsonResponse({ ok: true })
          },
        }),
      )
      renderApp('/settings/notifications')
      await userEvent.click(await screen.findByRole('button', { name: '이 기기 등록 해제' }))
      expect(await screen.findByText(/이 기기는 아직 등록되지 않았습니다/)).toBeInTheDocument()
      expect(calls).toEqual(['delete'])
      expect(browser.subscription.unsubscribe).toHaveBeenCalledOnce()
      expect(window.localStorage.getItem('tetris.pushSubscriptionId')).toBeNull()
    })

    it('서버에서 해제에 실패하면 브라우저 구독을 그대로 두고 알린다', async () => {
      const browser = installBrowser()
      window.localStorage.setItem('tetris.pushSubscriptionId', 'sub-1')
      await browser.registration.pushManager.subscribe()
      stubApi(
        withPush({
          'GET /api/push/subscriptions': () =>
            jsonResponse({
              subscriptions: [
                { id: 'sub-1', host: 'push.example.com', createdAt: '2026-11-15T00:00:00.000Z' },
              ],
            }),
          'DELETE /api/push/subscriptions/sub-1': () =>
            errorResponse(500, 'INTERNAL_ERROR', '서버에서 문제가 발생했습니다.'),
        }),
      )
      renderApp('/settings/notifications')
      await userEvent.click(await screen.findByRole('button', { name: '이 기기 등록 해제' }))
      expect(await screen.findByText('서버에서 문제가 발생했습니다.')).toBeInTheDocument()
      expect(browser.subscription.unsubscribe).not.toHaveBeenCalled()
    })

    it('등록된 기기 목록에서 다른 기기를 해제할 수 있다', async () => {
      installBrowser()
      const calls: string[] = []
      stubApi(
        withPush({
          'GET /api/push/subscriptions': () =>
            jsonResponse({
              subscriptions: [
                { id: 'other', host: 'fcm.googleapis.com', createdAt: '2026-11-15T00:00:00.000Z' },
              ],
            }),
          'DELETE /api/push/subscriptions/other': () => {
            calls.push('delete other')
            return jsonResponse({ ok: true })
          },
        }),
      )
      renderApp('/settings/notifications')
      const row = (await screen.findByText(/fcm\.googleapis\.com/)).closest('li') as HTMLElement
      await userEvent.click(
        within(row).getByRole('button', { name: 'fcm.googleapis.com 등록 해제' }),
      )
      await waitFor(() => expect(calls).toEqual(['delete other']))
    })
  })
})

describe('서비스 안내 화면 (/notice)', () => {
  const loggedOut = {
    ...loggedInHandlers(),
    'GET /api/auth/me': () => errorResponse(401, 'UNAUTHORIZED', '로그인이 필요합니다.'),
  }

  it('로그인하지 않아도 열리고, 하지 못하는 일과 알림 전달의 한계를 밝힌다', async () => {
    stubApi(loggedOut)
    const { router } = renderApp('/notice')
    expect(await screen.findByRole('heading', { name: '서비스 안내와 한계' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/notice')
    expect(screen.getByText('하지 못하는 일')).toBeInTheDocument()
    expect(screen.getAllByText(/이 화면이 열려 있을 때만/).length).toBeGreaterThan(0)
    expect(
      screen.getByText(/센서 모니터링에서는 카메라·마이크·위치 정보를 수집하지 않습니다/),
    ).toBeInTheDocument()
    expect(screen.getByText(/알림이 새로 만들어진 순간부터 약 4초의 영상만/)).toBeInTheDocument()
    expect(screen.getByText(/어르신의 상태와는 관계가 없습니다/)).toBeInTheDocument()
  })

  it('확정적·의학적 표현이 없다', async () => {
    stubApi(loggedOut)
    renderApp('/notice')
    await screen.findByRole('heading', { name: '서비스 안내와 한계' })
    const text =
      screen.getByRole('main', { hidden: true }).textContent ?? document.body.textContent ?? ''
    const body = document.body.textContent ?? text
    for (const phrase of FORBIDDEN_PHRASES) expect(body).not.toContain(phrase)
  })

  it('로그인 화면과 설정에서 이어지는 링크가 있다', async () => {
    stubApi(loggedOut)
    const login = renderApp('/login')
    expect(await screen.findByRole('link', { name: '서비스 안내와 한계' })).toHaveAttribute(
      'href',
      '/notice',
    )
    login.unmount()

    stubApi(loggedInHandlers())
    renderApp('/settings')
    // 설정 목록과 데스크톱 사이드바, 두 곳에 있다
    const links = await screen.findAllByRole('link', { name: /서비스 안내와 한계/ })
    expect(links.length).toBeGreaterThanOrEqual(2)
    expect(links.every((link) => link.getAttribute('href') === '/notice')).toBe(true)
  })
})
