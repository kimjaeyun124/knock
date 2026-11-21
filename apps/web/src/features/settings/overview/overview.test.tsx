import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { fakeSocketStatus } from '@/test/fakeSocket'
import { ALERT_PREFERENCES, DETECTION_SETTINGS, makeSensor } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

type Json = Record<string, unknown>

/** 서버처럼 저장된 설정을 기억하는 대역. 저장 요청(본문)도 남긴다. */
function fakeServer(
  initial: Partial<{
    detection: Json
    prefs: Json
    sensors: unknown[]
    failDetection: boolean
    failPrefs: boolean
  }> = {},
) {
  const state = {
    detection: { ...DETECTION_SETTINGS, ...initial.detection } as Json,
    prefs: { ...ALERT_PREFERENCES, ...initial.prefs } as Json,
    sensors: (initial.sensors ?? [
      makeSensor({ id: 'e', name: '현관문', zone: 'ENTRANCE' }),
      makeSensor({ id: 'b', name: '침대 옆', zone: 'BED_SIDE' }),
    ]) as Json[],
    detectionPuts: [] as Json[],
    prefsPuts: [] as Json[],
    sensorPatches: [] as { id: string; body: Json }[],
    failDetection: initial.failDetection ?? false,
    failPrefs: initial.failPrefs ?? false,
    detectionGets: 0,
  }
  const handlers: Record<string, ApiHandler> = {
    ...loggedInHandlers(),
    'GET /api/settings/detection': () => {
      state.detectionGets += 1
      return jsonResponse(state.detection)
    },
    'PUT /api/settings/detection': (req) => {
      if (state.failDetection) return errorResponse(500, 'INTERNAL', '서버에서 문제가 생겼습니다.')
      state.detectionPuts.push(req.body as Json)
      state.detection = { ...(req.body as Json), updatedAt: '2026-11-17T01:00:00.000Z' }
      return jsonResponse(state.detection)
    },
    'GET /api/settings/alerts': () => jsonResponse(state.prefs),
    'PUT /api/settings/alerts': (req) => {
      if (state.failPrefs) return errorResponse(500, 'INTERNAL', '서버에서 문제가 생겼습니다.')
      state.prefsPuts.push(req.body as Json)
      state.prefs = { ...(req.body as Json), updatedAt: '2026-11-17T01:00:00.000Z' }
      return jsonResponse(state.prefs)
    },
    'GET /api/sensors': () => jsonResponse({ sensors: state.sensors }),
    'GET /api/push/config': () => jsonResponse({ configured: false, publicKey: null }),
  }
  for (const sensor of state.sensors) {
    handlers[`PATCH /api/sensors/${String(sensor.id)}`] = (req) => {
      state.sensorPatches.push({ id: String(sensor.id), body: req.body as Json })
      Object.assign(sensor, req.body)
      return jsonResponse({ sensor })
    }
  }
  return { state, handlers }
}

const { updatedAt: _u, ...DETECTION_INPUT } = DETECTION_SETTINGS
const { updatedAt: _p, ...PREFS_INPUT } = ALERT_PREFERENCES

async function open(server = fakeServer()) {
  stubApi(server.handlers)
  const view = renderApp('/settings')
  await screen.findByRole('heading', { name: '1. 모니터링 설정' })
  return { ...server, ...view }
}

const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-text-size')
})

describe('설정 화면 구성', () => {
  it('모니터링·감지·알림·서비스 네 구역과 그 밖의 설정을 보여 준다', async () => {
    await open()
    for (const name of ['1. 모니터링 설정', '2. 감지 설정', '3. 알림 설정', '4. 서비스 설정']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: '모니터링' })).toHaveAttribute(
      'href',
      '#monitoring-group',
    )
  })

  it('불러오기에 실패하면 오류와 다시 시도를 보여 주고, 빈 설정을 보여 주지 않는다', async () => {
    const server = fakeServer()
    stubApi({
      ...server.handlers,
      'GET /api/settings/alerts': () => errorResponse(500, 'INTERNAL', '서버 오류'),
    })
    renderApp('/settings')
    expect(await screen.findByText('설정을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '1. 모니터링 설정' })).not.toBeInTheDocument()
  })

  it('금지 표현이 없다', async () => {
    await open()
    const main = document.querySelector('main') ?? document.body
    for (const phrase of FORBIDDEN_PHRASES) expect(main.textContent ?? '').not.toContain(phrase)
  })
})

describe('1. 모니터링 설정', () => {
  it('값을 바꾸기 전에는 저장할 수 없고, 한국 시간대가 고정이라고 알린다', async () => {
    await open()
    const section = card('모니터링')
    expect(within(section).getByRole('button', { name: '저장' })).toBeDisabled()
    expect(within(section).getByText(/한국 표준시 \(Asia\/Seoul, UTC\+9\)/)).toBeInTheDocument()
  })

  it('요일을 바꿔 저장하면 다른 감지 설정은 그대로 두고 서버에 보내고, 저장했다고 알린다', async () => {
    const { state } = await open()
    const section = card('모니터링')
    await userEvent.click(within(section).getByRole('button', { name: '평일' }))
    expect(within(section).getByText('현재 선택: 평일(월~금)')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/저장했습니다\./)).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([{ ...DETECTION_INPUT, activeWeekdays: [0, 1, 2, 3, 4] }])
  })

  it('시작·종료가 같으면 저장하지 않는다', async () => {
    const { state } = await open()
    const section = card('모니터링')
    const end = within(section).getByLabelText('감지 종료 시간')
    await userEvent.clear(end)
    await userEvent.type(end, '22:00')
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(
      await within(section).findByText('시작과 종료 시각은 달라야 합니다.'),
    ).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([])
  })

  it('모니터링을 켠 채 요일을 모두 빼면 저장하지 않고 이유를 알린다', async () => {
    const { state } = await open()
    const section = card('모니터링')
    for (const day of ['월', '화', '수', '목', '금', '토', '일']) {
      await userEvent.click(
        within(section).getByRole('button', { name: new RegExp(`^${day}요일`) }),
      )
    }
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/요일을 하나 이상 고르거나/)).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([])
  })

  it('모니터링을 끄면 한 번 더 확인하고, 취소하면 저장하지 않는다', async () => {
    const { state } = await open()
    const section = card('모니터링')
    await userEvent.click(within(section).getByRole('switch', { name: /^모니터링 사용/ }))
    expect(
      within(section).getByText('모니터링을 끄면 움직임 알림이 오지 않습니다'),
    ).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('중요한 알림이 전달되지 않게 됩니다')).toBeInTheDocument()
    expect(within(dialog).getByText(/현관 근처 움직임/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(state.detectionPuts).toEqual([])

    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '그래도 저장' }),
    )
    await waitFor(() =>
      expect(state.detectionPuts).toEqual([{ ...DETECTION_INPUT, monitoringEnabled: false }]),
    )
    // 맨 위 요약이 바뀐 설정을 반영한다.
    expect(await screen.findByText('중요한 알림이 전달되지 않는 설정입니다')).toBeInTheDocument()
  })

  it('이미 막혀 있던 것을 다시 켜는 저장에는 확인을 묻지 않는다 (현관 알림이 꺼진 채 모니터링을 켜는 경우)', async () => {
    const { state } = await open(
      fakeServer({ detection: { monitoringEnabled: false }, prefs: { entranceApproach: false } }),
    )
    const section = card('모니터링')
    await userEvent.click(within(section).getByRole('switch', { name: /^모니터링 사용/ }))
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/저장했습니다\./)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(state.detectionPuts).toEqual([{ ...DETECTION_INPUT, monitoringEnabled: true }])
  })

  it('저장 실패를 성공으로 보이지 않는다: 이유와 "서버에 반영되지 않았습니다"를 알리고 변경은 남는다', async () => {
    const { state } = await open(fakeServer({ failDetection: true }))
    const section = card('모니터링')
    await userEvent.click(within(section).getByRole('button', { name: '평일' }))
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    const alert = await within(section).findByRole('alert')
    expect(alert).toHaveTextContent('서버에 반영되지 않았습니다')
    expect(within(section).queryByText(/저장했습니다\./)).not.toBeInTheDocument()
    expect(within(section).getByText('현재 선택: 평일(월~금)')).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([])
  })

  it('저장 순간 서버의 최신 값에 바꾼 항목만 덮어쓴다 (다른 화면에서 바꾼 값을 되돌리지 않는다)', async () => {
    const { state } = await open()
    // 이 화면을 연 뒤 다른 곳에서 중복 알림 간격을 45분으로 바꿨다.
    state.detection = { ...state.detection, cooldownMinutes: 45 }
    const section = card('모니터링')
    await userEvent.click(within(section).getByRole('button', { name: '평일' }))
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(state.detectionPuts).toHaveLength(1))
    expect(state.detectionPuts[0]).toMatchObject({
      cooldownMinutes: 45,
      activeWeekdays: [0, 1, 2, 3, 4],
    })
  })
})

describe('2. 감지 설정', () => {
  it('서버 판단 민감도와 센서 하드웨어 민감도가 다르다고 밝힌다', async () => {
    await open()
    expect(screen.getByText('이 민감도는 서버가 신호를 해석하는 기준입니다')).toBeInTheDocument()
    // 지원하지 않는 센서마다 서버 기준만 바뀐다고 표시한다.
    expect(
      screen.getAllByText(
        /하드웨어 민감도 조절을 지원하지 않습니다. 서버가 신호를 해석하는 기준만 바뀌고/,
      ),
    ).toHaveLength(2)
  })

  it('기본 민감도와 반복 감지 처리 시간을 저장한다 (범위 밖 값은 거부)', async () => {
    const { state } = await open()
    const section = card('민감도와 반복 감지')
    await userEvent.click(within(section).getByRole('radio', { name: /^높음/ }))
    const minutes = within(section).getByLabelText(/반복 감지 처리 시간/)
    await userEvent.clear(minutes)
    await userEvent.type(minutes, '99')
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/1~60분 사이의 정수/)).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([])

    await userEvent.clear(minutes)
    await userEvent.type(minutes, '15')
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/저장했습니다\./)).toBeInTheDocument()
    expect(state.detectionPuts).toEqual([
      { ...DETECTION_INPUT, sensitivity: 'HIGH', sequenceWindowMinutes: 15 },
    ])
  })

  it('센서별 민감도를 고르면 바로 서버에 저장하고, 그 센서에서 일어나는 일을 설명한다', async () => {
    const { state } = await open()
    const select = screen.getByLabelText(/^침대 옆/)
    expect(screen.getByText(/‘침대 주변 움직임’ 알림은 만들지 않습니다/)).toBeInTheDocument()
    await userEvent.selectOptions(select, 'HIGH')
    await waitFor(() =>
      expect(state.sensorPatches).toEqual([{ id: 'b', body: { sensitivity: 'HIGH' } }]),
    )
    expect(
      await screen.findByText(/이 센서의 움직임마다 ‘침대 주변 움직임’ 알림을 만듭니다/),
    ).toBeInTheDocument()
    // 기본 설정 따르기로 되돌리면 null 을 보낸다.
    await userEvent.selectOptions(screen.getByLabelText(/^침대 옆/), 'DEFAULT')
    await waitFor(() =>
      expect(state.sensorPatches.at(-1)).toEqual({ id: 'b', body: { sensitivity: null } }),
    )
  })

  it('이벤트 규칙은 현재 설정 값으로 설명하고, 현관 알림을 끄는 저장은 한 번 더 확인한다', async () => {
    const { state } = await open()
    const section = card('이벤트 판단 규칙과 알림')
    expect(
      within(section).getByText(
        /매일 밤\(22:00~06:00\)에 현관 센서에서 움직임이 감지되면 알립니다/,
      ),
    ).toBeInTheDocument()

    await userEvent.click(within(section).getByRole('switch', { name: /^현관 근처 움직임/ }))
    expect(within(section).getByText(/끄면 이 알림이 전달되지 않습니다/)).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/즉시 확인 권장 수준/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: '그래도 저장' }))
    await waitFor(() =>
      expect(state.prefsPuts).toEqual([{ ...PREFS_INPUT, entranceApproach: false }]),
    )
  })

  it('현관이 아닌 알림을 끄는 저장은 바로 저장된다', async () => {
    const { state } = await open()
    const section = card('이벤트 판단 규칙과 알림')
    await userEvent.click(
      within(section).getByRole('switch', { name: /^짧은 시간 안의 반복된 움직임/ }),
    )
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/저장했습니다\./)).toBeInTheDocument()
    expect(state.prefsPuts).toEqual([{ ...PREFS_INPUT, repeatedMovement: false }])
  })
})

describe('3. 알림 설정', () => {
  it('센서 장애·배터리 알림을 따로 끄고, 끄면 무엇이 전달되지 않는지 설명한다', async () => {
    const { state } = await open()
    const section = card('센서 장애·배터리 알림')
    await userEvent.click(within(section).getByRole('switch', { name: /^배터리 부족 알림/ }))
    expect(
      within(section).getByText(/배터리가 떨어져 센서가 멈추기 전에 알림을 받지 못합니다/),
    ).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/저장했습니다\./)).toBeInTheDocument()
    expect(state.prefsPuts).toEqual([{ ...PREFS_INPUT, lowBattery: false }])
    // 맨 위 요약에도 반영된다.
    expect(await screen.findByText('배터리 부족 알림이 전달되지 않습니다')).toBeInTheDocument()
  })

  it('저장 실패는 이유와 함께 알리고 성공으로 보이지 않는다', async () => {
    await open(fakeServer({ failPrefs: true }))
    const section = card('센서 장애·배터리 알림')
    await userEvent.click(within(section).getByRole('switch', { name: /^센서 장애 알림/ }))
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      '서버에 반영되지 않았습니다',
    )
    expect(within(section).queryByText(/저장했습니다\./)).not.toBeInTheDocument()
  })

  it('중복 알림 간격: 범위를 검사하고, 60분 이상이면 새 상황을 늦게 알 수 있다고 알린다', async () => {
    const { state } = await open()
    const section = card('중복 알림 간격')
    const input = within(section).getByLabelText(/같은 종류의 알림을 다시 만들지 않는 시간/)
    await userEvent.clear(input)
    await userEvent.type(input, '500')
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    expect(await within(section).findByText(/1~120분 사이의 정수/)).toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, '90')
    expect(
      within(section).getByText('간격이 길면 새 상황을 늦게 알 수 있습니다'),
    ).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(state.detectionPuts).toEqual([{ ...DETECTION_INPUT, cooldownMinutes: 90 }]),
    )
  })

  it('알림 소리는 이 기기에 저장되고, 푸시가 없으면 앱 화면이 열려 있을 때만 알림이 보인다고 알린다', async () => {
    await open()
    const toggle = screen.getByRole('switch', { name: /^알림 소리/ })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(window.localStorage.getItem('tetris.alertSound')).toBe('on')
    expect(
      await screen.findByText(/서버에는 브라우저 푸시가 설정되어 있지 않습니다/),
    ).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(window.localStorage.getItem('tetris.alertSound')).toBe('off')
  })
})

describe('4. 서비스 설정 (이 기기에만 저장)', () => {
  it('테마를 고르면 바로 적용·저장된다', async () => {
    await open()
    await userEvent.click(screen.getByRole('radio', { name: /^어둡게/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('tetris.theme')).toBe('dark')
    await userEvent.click(screen.getByRole('radio', { name: /^밝게/ }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('글자 크기를 고르면 <html> 에 반영된다', async () => {
    await open()
    await userEvent.click(screen.getByRole('radio', { name: /^아주 크게/ }))
    expect(document.documentElement.dataset.textSize).toBe('xlarge')
    expect(window.localStorage.getItem('tetris.textSize')).toBe('xlarge')
    await userEvent.click(screen.getByRole('radio', { name: /^보통\s*기본 크기/ }))
    expect(document.documentElement.dataset.textSize).toBe('normal')
  })

  it('자동 새로고침 간격을 저장하고, "지금 새로고침"은 서버에서 다시 읽는다', async () => {
    const { state } = await open()
    await userEvent.selectOptions(screen.getByLabelText('자동 새로고침'), '1m')
    expect(window.localStorage.getItem('tetris.refresh')).toBe('1m')

    const before = state.detectionGets
    await userEvent.click(screen.getByRole('button', { name: '지금 새로고침' }))
    expect(await screen.findByText(/최신 정보를 요청했습니다/)).toBeInTheDocument()
    expect(state.detectionGets).toBeGreaterThan(before)
  })

  it('실시간 연결의 재연결 시도·성공 횟수와 마지막 연결 시각을 보여 준다', async () => {
    fakeSocketStatus.set('connected')
    fakeSocketStatus.setInfo({
      reconnectAttempts: 2,
      reconnectCount: 4,
      lastConnectedAt: new Date('2026-11-17T01:23:00Z'),
      lastError: '서버가 응답하지 않습니다',
    })
    await open()
    const section = card('시스템 연결 상태')
    expect(
      within(section).getByText('지금 끊김에서 2번 시도 · 다시 연결에 성공한 횟수 4번'),
    ).toBeInTheDocument()
    expect(within(section).getByText('마지막 연결 오류')).toBeInTheDocument()
    expect(within(section).getByText('서버가 응답하지 않습니다')).toBeInTheDocument()
    expect(within(section).getByText(/11월 17일/)).toBeInTheDocument()
  })

  it('시스템 연결 상태와 서버·실시간 연결을 보여 준다', async () => {
    await open()
    const section = card('시스템 연결 상태')
    for (const label of ['인터넷', '서버', '실시간 연결', '마지막으로 정상이었던 시각']) {
      expect(within(section).getByText(label)).toBeInTheDocument()
    }
    expect(within(section).getByRole('button', { name: '연결 다시 확인' })).toBeInTheDocument()
  })
})

describe('맨 위 요약: 지금 설정에서 전달되지 않는 알림', () => {
  it('민감도가 높음이고 모든 알림이 켜져 있으면 모든 종류가 전달된다고 알린다 (안전 보장 문구는 쓰지 않는다)', async () => {
    await open(fakeServer({ detection: { sensitivity: 'HIGH' } }))
    expect(
      await screen.findByText('지금 설정에서는 모든 종류의 알림이 전달됩니다'),
    ).toBeInTheDocument()
    expect(screen.getByText(/알림이 없다고 해서 괜찮다는 뜻은 아닙니다/)).toBeInTheDocument()
  })

  it('끈 알림이 있으면 무엇이 전달되지 않는지 항목으로 알린다', async () => {
    await open(fakeServer({ prefs: { entranceApproach: false, sensorIssues: false } }))
    expect(await screen.findByText('중요한 알림이 전달되지 않는 설정입니다')).toBeInTheDocument()
    expect(screen.getByText(/‘현관 근처 움직임’ 알림이 전달되지 않습니다/)).toBeInTheDocument()
    expect(screen.getByText('센서 연결 끊김·복구 알림이 전달되지 않습니다')).toBeInTheDocument()
  })
})
