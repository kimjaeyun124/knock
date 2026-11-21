import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { ALERT_PREFERENCES, DETECTION_SETTINGS, HOUSEHOLD, makeSensor } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

type Json = Record<string, unknown>

/** 서버처럼 저장된 값을 기억하는 대역. 요청 기록도 남긴다. */
function fakeServer(
  initial: Partial<{
    household: Json
    sensors: unknown[]
    detection: Json
    prefs: Json
    pushConfig: Json
    failHousehold: boolean
  }> = {},
) {
  const state = {
    household: { ...HOUSEHOLD, ...initial.household } as Json,
    sensors: initial.sensors ?? [],
    detection: { ...DETECTION_SETTINGS, ...initial.detection } as Json,
    prefs: { ...ALERT_PREFERENCES, ...initial.prefs } as Json,
    householdPuts: [] as Json[],
    detectionPuts: [] as Json[],
    prefsPuts: [] as Json[],
    sensorGets: 0,
    failHousehold: initial.failHousehold ?? false,
  }
  const handlers: Record<string, ApiHandler> = {
    ...loggedInHandlers(),
    'GET /api/household': () => jsonResponse({ household: state.household }),
    'PUT /api/household': (req) => {
      if (state.failHousehold) return errorResponse(500, 'INTERNAL', '서버에서 문제가 생겼습니다.')
      const body = req.body as Json
      state.householdPuts.push(body)
      const next = { ...state.household }
      if (body.recipientAlias !== undefined) next.recipientAlias = body.recipientAlias
      if (body.recipientMemo !== undefined) next.recipientMemo = body.recipientMemo || null
      if (typeof body.onboardingStep === 'number') {
        next.onboardingStep = Math.max(next.onboardingStep as number, body.onboardingStep)
      }
      if (body.completeSetup) {
        next.setupCompleted = true
        next.setupCompletedAt = '2026-11-17T00:00:00.000Z'
        next.onboardingStep = 6
      }
      state.household = next
      return jsonResponse({ household: next })
    },
    'GET /api/sensors': () => {
      state.sensorGets += 1
      return jsonResponse({ sensors: state.sensors })
    },
    'GET /api/settings/detection': () => jsonResponse(state.detection),
    'PUT /api/settings/detection': (req) => {
      state.detectionPuts.push(req.body as Json)
      state.detection = { ...(req.body as Json), updatedAt: '2026-11-17T00:00:00.000Z' }
      return jsonResponse(state.detection)
    },
    'GET /api/settings/alerts': () => jsonResponse(state.prefs),
    'PUT /api/settings/alerts': (req) => {
      state.prefsPuts.push(req.body as Json)
      state.prefs = { ...(req.body as Json), updatedAt: '2026-11-17T00:00:00.000Z' }
      return jsonResponse(state.prefs)
    },
    'GET /api/push/config': () =>
      jsonResponse(initial.pushConfig ?? { configured: false, publicKey: null }),
  }
  return { state, handlers }
}

const reachedAll = { household: { onboardingStep: 6 } }

afterEach(() => vi.unstubAllGlobals())

describe('1단계 서비스 소개', () => {
  it('한계를 이해했다고 확인해야 시작할 수 있고, 시작하면 2단계가 서버에 저장된다', async () => {
    const { state, handlers } = fakeServer()
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('1/6 단계 · 서비스 소개')).toBeInTheDocument()
    expect(
      screen.getByText(/넘어짐이나 외출 같은 상황을 판단하거나 막아 주지 않습니다/),
    ).toBeInTheDocument()
    const start = screen.getByRole('button', { name: '시작하기' })
    expect(start).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /한계를 이해했습니다/ }))
    await userEvent.click(start)
    expect(await screen.findByText('2/6 단계 · 보호 대상')).toBeInTheDocument()
    expect(state.householdPuts).toEqual([{ onboardingStep: 2 }])
  })
})

describe('2단계 보호 대상', () => {
  it('호칭이 비어 있으면 저장하지 않고, 입력하면 호칭·메모·진행 단계를 함께 저장한다', async () => {
    const { state, handlers } = fakeServer({
      household: { onboardingStep: 2, recipientAlias: null },
    })
    stubApi(handlers)
    renderApp('/onboarding')
    const alias = await screen.findByLabelText('표시 이름 (필수)')
    expect(screen.getByText(/실명, 주민등록번호, 전화번호, 주소/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('호칭을 입력해 주세요.')).toBeInTheDocument()
    expect(state.householdPuts).toEqual([])

    await userEvent.type(alias, '  할머니 ')
    await userEvent.type(screen.getByLabelText(/^메모 \(선택\)/), '밤에 화장실에 가심')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('3/6 단계 · 센서')).toBeInTheDocument()
    expect(state.householdPuts).toEqual([
      { recipientAlias: '할머니', recipientMemo: '밤에 화장실에 가심', onboardingStep: 3 },
    ])
  })

  it('메모는 200자까지만 입력되고 남은 글자 수를 알린다', async () => {
    const { handlers } = fakeServer({ household: { onboardingStep: 2 } })
    stubApi(handlers)
    renderApp('/onboarding')
    const memo = await screen.findByLabelText(/^메모 \(선택\)/)
    expect(memo).toHaveAttribute('maxlength', '200')
    expect(screen.getByText(/0\/200자/)).toBeInTheDocument()
  })

  it('이전 단계로 갔다 와도 입력하던 값이 남아 있다', async () => {
    const { handlers } = fakeServer({ household: { onboardingStep: 2 } })
    stubApi(handlers)
    renderApp('/onboarding')
    const alias = await screen.findByLabelText('표시 이름 (필수)')
    await userEvent.clear(alias)
    await userEvent.type(alias, '엄마')
    await userEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(await screen.findByText('1/6 단계 · 서비스 소개')).toBeInTheDocument()
    // 이미 확인하고 지나온 단계라 다시 확인하지 않아도 된다.
    expect(screen.getByRole('checkbox', { name: /한계를 이해했습니다/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: '시작하기' }))
    expect(await screen.findByLabelText('표시 이름 (필수)')).toHaveValue('엄마')
  })

  it('저장에 실패하면 그 자리에 머물고 이유를 알리며 입력값을 지우지 않는다', async () => {
    const { state, handlers } = fakeServer({
      household: { onboardingStep: 2 },
      failHousehold: true,
    })
    stubApi(handlers)
    renderApp('/onboarding')
    const alias = await screen.findByLabelText('표시 이름 (필수)')
    await userEvent.clear(alias)
    await userEvent.type(alias, '아버지')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 문제가 생겼습니다.')
    expect(screen.getByText('2/6 단계 · 보호 대상')).toBeInTheDocument()
    expect(alias).toHaveValue('아버지')
    expect(state.householdPuts).toEqual([])
  })
})

describe('3단계 센서', () => {
  it('센서가 없으면 모니터링되지 않는다고 알리고, 센서 없이도 계속할 수 있다', async () => {
    const { state, handlers } = fakeServer({ household: { onboardingStep: 3 } })
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('등록된 센서가 없습니다')).toBeInTheDocument()
    expect(screen.getAllByText(/모니터링되지 않습니다/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '나중에 등록하고 계속' }))
    expect(await screen.findByText('4/6 단계 · 모니터링 시간')).toBeInTheDocument()
    expect(state.householdPuts).toEqual([{ onboardingStep: 4 }])
  })

  it('첫 신호가 없는 센서는 연결되었다고 표시하지 않고, 다시 확인하면 서버에서 다시 읽는다', async () => {
    const { state, handlers } = fakeServer({
      household: { onboardingStep: 3 },
      sensors: [
        makeSensor({ id: 'a', name: '침대 옆', lastSeenAt: null, state: 'PENDING' }),
        makeSensor({ id: 'b', name: '복도', zone: 'PATH', origin: 'SIMULATED' }),
      ],
    })
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('등록한 센서 2개')).toBeInTheDocument()
    expect(screen.getByText('아직 첫 신호를 받지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByText(/센서 1개가 아직 첫 신호를 보내지 않았습니다/)).toBeInTheDocument()
    expect(screen.getByText(/실제 센서/)).toBeInTheDocument()
    expect(screen.getByText(/시뮬레이션 센서\(실제 장치 아님\)/)).toBeInTheDocument()
    expect(
      screen.queryByText('첫 신호를 받았습니다. 센서가 연결되었습니다'),
    ).not.toBeInTheDocument()

    const before = state.sensorGets
    await userEvent.click(await screen.findByRole('button', { name: '연결 상태 다시 확인' }))
    await waitFor(() => expect(state.sensorGets).toBeGreaterThan(before))
  })

  it('센서 추가는 단계 안에서 등록 안내를 열고, 취소하면 닫힌다', async () => {
    const { handlers } = fakeServer({ household: { onboardingStep: 3 } })
    stubApi(handlers)
    renderApp('/onboarding')
    await userEvent.click(await screen.findByRole('button', { name: '센서 추가' }))
    expect(await screen.findByText('센서 유형을 고르세요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '나중에 등록하고 계속' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(await screen.findByRole('button', { name: '센서 추가' })).toBeInTheDocument()
  })
})

describe('4단계 모니터링 시간', () => {
  it('제안 시간으로 시작하고, 시작과 종료가 같으면 저장하지 않는다', async () => {
    const { state, handlers } = fakeServer({ household: { onboardingStep: 4 } })
    stubApi(handlers)
    renderApp('/onboarding')
    const start = await screen.findByLabelText('시작 시각')
    const end = screen.getByLabelText('종료 시각')
    expect(start).toHaveValue('22:00')
    expect(end).toHaveValue('06:00')
    expect(screen.getByText(/오후 10:00부터 다음 날 오전 6:00까지, 8시간 동안/)).toBeInTheDocument()

    await userEvent.clear(end)
    await userEvent.type(end, '22:00')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('시작과 종료 시각은 달라야 합니다.')).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([])
  })

  it('직접 고친 시간은 다른 감지 설정을 그대로 둔 채 저장되고, 제안 시간으로 되돌릴 수 있다', async () => {
    const { state, handlers } = fakeServer({ household: { onboardingStep: 4 } })
    stubApi(handlers)
    renderApp('/onboarding')
    const start = await screen.findByLabelText('시작 시각')
    const end = screen.getByLabelText('종료 시각')
    await userEvent.clear(start)
    await userEvent.type(start, '21:30')
    await userEvent.clear(end)
    await userEvent.type(end, '05:45')
    await userEvent.click(screen.getByRole('button', { name: '제안한 시간으로 되돌리기' }))
    expect(start).toHaveValue('22:00')
    expect(end).toHaveValue('06:00')

    await userEvent.clear(start)
    await userEvent.type(start, '21:30')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('5/6 단계 · 알림')).toBeInTheDocument()
    const { updatedAt: _ignored, ...rest } = DETECTION_SETTINGS
    expect(state.detectionPuts).toEqual([{ ...rest, nightStart: '21:30', nightEnd: '06:00' }])
    expect(state.householdPuts).toEqual([{ onboardingStep: 5 }])
  })
})

describe('5단계 알림', () => {
  it('받을 알림을 고르고 저장한다. 브라우저 알림 권한은 요청하지 않는다', async () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const { state, handlers } = fakeServer({ household: { onboardingStep: 5 } })
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('어떤 알림을 받을까요?')).toBeInTheDocument()
    expect(
      await screen.findByText(/서버에는 브라우저 푸시가 설정되어 있지 않습니다/),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: /^현관 근처 움직임/ }))
    await userEvent.click(screen.getByRole('switch', { name: /^센서 이상 알림/ }))
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('6/6 단계 · 확인')).toBeInTheDocument()
    const { updatedAt: _ignored, ...rest } = ALERT_PREFERENCES
    expect(state.prefsPuts).toEqual([{ ...rest, entranceApproach: false, sensorIssues: false }])
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('모든 알림을 끄면 경고한다', async () => {
    const { handlers } = fakeServer({ household: { onboardingStep: 5 } })
    stubApi(handlers)
    renderApp('/onboarding')
    await screen.findByText('어떤 알림을 받을까요?')
    for (const name of [
      /^현관 근처 움직임/,
      /^침대 주변에서 이동 경로로/,
      /^짧은 시간 안의/,
      /^침대 주변 움직임/,
      /^센서 이상 알림/,
      /^배터리 부족 알림/,
    ]) {
      await userEvent.click(screen.getByRole('switch', { name }))
    }
    expect(screen.getByText('모든 알림을 껐습니다')).toBeInTheDocument()
  })

  it('서버에 푸시가 설정되어 있고 브라우저가 지원하면, 버튼을 눌러야만 권한을 요청한다', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    vi.stubGlobal('PushManager', class {})
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: vi.fn(), getRegistration: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    const { handlers } = fakeServer({
      household: { onboardingStep: 5 },
      pushConfig: { configured: true, publicKey: 'BKey' },
    })
    stubApi({
      ...handlers,
      'GET /api/push/subscriptions': () => jsonResponse({ subscriptions: [] }),
    })
    renderApp('/onboarding')
    const button = await screen.findByRole('button', { name: '이 기기에서 알림 받기' })
    expect(requestPermission).not.toHaveBeenCalled()
    await userEvent.click(button)
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/알림 권한이 허용되지 않았습니다/)).toBeInTheDocument()
    // 허용하지 않아도 다음 단계로 갈 수 있다.
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })
})

describe('6단계 설정 확인', () => {
  it('저장된 설정을 요약하고 미완료 항목을 알린 뒤, 완료하면 대시보드로 간다', async () => {
    const { state, handlers } = fakeServer({
      household: {
        ...reachedAll.household,
        recipientAlias: '할머니',
        recipientMemo: '밤에 자주 깨심',
      },
      prefs: { sensorIssues: false },
      detection: { nightStart: '21:00', nightEnd: '05:00' },
    })
    stubApi(handlers)
    const { router } = renderApp('/onboarding?step=6')
    expect(await screen.findByText('6/6 단계 · 확인')).toBeInTheDocument()
    expect(await screen.findByText('할머니')).toBeInTheDocument()
    expect(screen.getByText('밤에 자주 깨심')).toBeInTheDocument()
    expect(screen.getByText('등록한 센서가 없습니다.')).toBeInTheDocument()
    expect(screen.getByText(/오후 9:00 ~ 다음 날 오전 5:00 \(8시간\)/)).toBeInTheDocument()
    const alertCard = screen.getByRole('heading', { name: '알림 설정' }).closest('section')!
    expect(within(alertCard).getByText(/^센서 이상/).nextSibling).toHaveTextContent('받지 않음')
    // 센서가 없음 → 완료를 막지는 않지만 경고한다
    expect(screen.getByText('아직 마치지 않은 항목')).toBeInTheDocument()
    expect(screen.getByText(/등록한 센서가 없습니다. 센서를 등록하기 전에는/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '설정 완료' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(state.householdPuts).toEqual([{ completeSetup: true }])
  })

  it('호칭이 없으면 완료할 수 없고, 해당 단계로 돌아갈 수 있다', async () => {
    const { state, handlers } = fakeServer({
      household: { ...reachedAll.household, recipientAlias: null },
    })
    stubApi(handlers)
    renderApp('/onboarding?step=6')
    expect(
      await screen.findByText('설정을 완료하려면 먼저 채워야 할 항목이 있습니다'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정 완료' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '2단계로 가기' }))
    expect(await screen.findByText('2/6 단계 · 보호 대상')).toBeInTheDocument()
    expect(state.householdPuts).toEqual([])
  })

  it('센서가 연결되어 있고 모두 갖추면 "모든 항목을 설정했습니다"', async () => {
    const { handlers } = fakeServer({
      household: { ...reachedAll.household, recipientAlias: '할머니' },
      sensors: [makeSensor()],
    })
    stubApi(handlers)
    renderApp('/onboarding?step=6')
    expect(await screen.findByText('모든 항목을 설정했습니다')).toBeInTheDocument()
  })

  it('완료 저장에 실패하면 대시보드로 가지 않고 이유를 알린다', async () => {
    const { state, handlers } = fakeServer({
      household: { ...reachedAll.household, recipientAlias: '할머니' },
      failHousehold: true,
    })
    stubApi(handlers)
    const { router } = renderApp('/onboarding?step=6')
    await userEvent.click(await screen.findByRole('button', { name: '설정 완료' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에서 문제가 생겼습니다.')
    expect(router.state.location.pathname).toBe('/onboarding')
    expect(state.householdPuts).toEqual([])
  })
})

describe('이탈 후 복구와 반복 방지', () => {
  it('도중에 나갔다 돌아오면 저장된 단계에서 이어 하고, 이어 한다고 알린다', async () => {
    const { handlers } = fakeServer({ household: { onboardingStep: 4, recipientAlias: '할머니' } })
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('4/6 단계 · 모니터링 시간')).toBeInTheDocument()
    expect(screen.getByText('이전에 하던 곳에서 이어서 합니다')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(await screen.findByText('3/6 단계 · 센서')).toBeInTheDocument()
  })

  it('아직 도달하지 않은 단계로 주소를 바꿔도 건너뛰지 못한다', async () => {
    const { handlers } = fakeServer({ household: { onboardingStep: 3 } })
    stubApi(handlers)
    renderApp('/onboarding?step=6')
    expect(await screen.findByText('3/6 단계 · 센서')).toBeInTheDocument()
  })

  it('처음 시작하는 사용자는 1단계에서 시작하고 이어 한다는 안내가 없다', async () => {
    const { handlers } = fakeServer()
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('1/6 단계 · 서비스 소개')).toBeInTheDocument()
    expect(screen.queryByText('이전에 하던 곳에서 이어서 합니다')).not.toBeInTheDocument()
  })

  it('이미 마친 사용자에게는 설정을 다시 시키지 않고, 바꿀 곳을 안내한다', async () => {
    const { state, handlers } = fakeServer({
      household: {
        setupCompleted: true,
        setupCompletedAt: '2026-11-10T00:00:00.000Z',
        onboardingStep: 6,
      },
    })
    stubApi(handlers)
    renderApp('/onboarding')
    expect(await screen.findByText('초기 설정을 이미 마쳤습니다')).toBeInTheDocument()
    expect(screen.queryByText(/단계 ·/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '대시보드로 가기' })).toHaveAttribute('href', '/')
    expect(
      screen
        .getAllByRole('link', { name: '센서 관리' })
        .every((l) => l.getAttribute('href') === '/sensors'),
    ).toBe(true)
    expect(state.householdPuts).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: '초기 설정 단계를 다시 살펴보기' }))
    expect(await screen.findByText(/^\d\/6 단계 ·/)).toBeInTheDocument()
  })

  it('이미 마친 사용자도 주소로 특정 단계를 열 수 있다', async () => {
    const { handlers } = fakeServer({ household: { setupCompleted: true, onboardingStep: 6 } })
    stubApi(handlers)
    renderApp('/onboarding?step=4')
    expect(await screen.findByText('4/6 단계 · 모니터링 시간')).toBeInTheDocument()
  })

  it('불러오기에 실패하면 오류와 다시 시도를 보여 주고, 빈 설정으로 시작하지 않는다', async () => {
    const { handlers } = fakeServer()
    stubApi({
      ...handlers,
      'GET /api/settings/alerts': () => errorResponse(500, 'INTERNAL', '서버 오류'),
    })
    renderApp('/onboarding')
    expect(await screen.findByText('초기 설정 정보를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText(/단계 ·/)).not.toBeInTheDocument()
  })
})

describe('안내 문구', () => {
  it.each([1, 2, 3, 4, 5, 6])('%i단계에 확정적·금지 표현이 없다', async (step) => {
    const { handlers } = fakeServer({ household: { onboardingStep: 6, recipientAlias: '할머니' } })
    stubApi(handlers)
    renderApp(`/onboarding?step=${step}`)
    await screen.findByText(new RegExp(`^${step}/6 단계`))
    await waitFor(() => expect(screen.queryByText('불러오는 중')).not.toBeInTheDocument())
    const main = document.querySelector('main') ?? document.body
    for (const phrase of FORBIDDEN_PHRASES) {
      // 서비스 한계 문구는 "넘어짐이나 외출" 처럼 금지 표현을 쓰지 않는다.
      expect(main.textContent ?? '').not.toContain(phrase)
    }
  })
})
