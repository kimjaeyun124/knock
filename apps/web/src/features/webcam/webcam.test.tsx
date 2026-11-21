import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { makeSimulatorState } from '@/test/fixtures'
import { jsonResponse, loggedInHandlers, renderApp, stubApi, type ApiHandler } from '@/test/helpers'

/** fetch 첫 인자(문자열·URL·Request)를 주소 문자열로 */
const hrefOf = (input: unknown): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

const W = 64
const H = 48

const state = (night: Record<string, unknown> = {}) =>
  makeSimulatorState({
    night: { start: '22:00', end: '06:00', isNightNow: true, sensitivity: 'MEDIUM', ...night },
  })

const enabled = (extra: Record<string, ApiHandler> = {}, night: Record<string, unknown> = {}) => ({
  ...loggedInHandlers(),
  'GET /api/system/features': () => jsonResponse({ simulatorEnabled: true }),
  'GET /api/dev/simulator/state': () => jsonResponse(state(night)),
  'POST /api/dev/simulator/sensors': () => jsonResponse(state(night)),
  ...extra,
})

/**
 * 가짜 카메라. getImageData 를 호출할 때마다 `pattern` 이 정한 칸만 검정/흰색을 번갈아 바꿔 준다.
 *  - all: 화면 전체  - rawRight: 카메라 원본의 오른쪽 칸(화면에 보이는 거울 상으로는 왼쪽 = 침대 주변)
 *  - rawLeft: 원본 왼쪽 칸(보이는 오른쪽 = 현관)  - none: 변화 없음
 *  - burstBed/burstDoor: 침대 칸/현관 칸에서 처음 3번(0.45초)만 바뀌고 멈춘다 (뒤척임·지나감 같은 짧은 변화)
 */
function installFakeCamera(
  options: {
    rejectWith?: string
    pattern?: 'all' | 'rawRight' | 'rawLeft' | 'none' | 'burstBed' | 'burstDoor'
  } = {},
) {
  const stop = vi.fn()
  const track = Object.assign(new EventTarget(), { stop })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const getUserMedia = vi.fn(() =>
    options.rejectWith
      ? Promise.reject(new DOMException('x', options.rejectWith))
      : Promise.resolve(stream),
  )
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  const pattern = options.pattern ?? 'all'
  let calls = 0
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        drawImage: () => undefined,
        getImageData: () => {
          calls += 1
          const burst = pattern === 'burstBed' || pattern === 'burstDoor'
          const on = calls % 2 === 1 && (!burst || calls <= 4)
          const data = new Uint8ClampedArray(W * H * 4)
          for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W; x += 1) {
              const inside =
                pattern === 'all' ||
                ((pattern === 'rawRight' || pattern === 'burstBed') && x >= 44) ||
                ((pattern === 'rawLeft' || pattern === 'burstDoor') && x < 20)
              const value = inside && on ? 255 : 0
              const i = (y * W + x) * 4
              data[i] = value
              data[i + 1] = value
              data[i + 2] = value
              data[i + 3] = 255
            }
          }
          return { data }
        },
      }) as unknown as CanvasRenderingContext2D,
  )
  return { getUserMedia, stop }
}

const startCamera = async () => {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '카메라 시작' }))
  return user
}

describe('웹캠 움직임 감지 화면', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('시연 기능이 꺼져 있으면 이유를 알리고 카메라·API 를 건드리지 않는다', async () => {
    const camera = installFakeCamera()
    const fetchMock = stubApi(loggedInHandlers())
    renderApp('/dev/webcam')
    expect(await screen.findByText('시연 기능이 꺼져 있습니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '카메라 시작' })).not.toBeInTheDocument()
    expect(camera.getUserMedia).not.toHaveBeenCalled()
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.includes('/dev/simulator'),
      ),
    ).toBe(false)
  })

  it('기본은 "알림에 영상 첨부"가 켜져 있고, 알림이 생길 때만 짧은 영상이 서버로 간다고 분명히 알린다', async () => {
    const camera = installFakeCamera()
    stubApi(enabled())
    renderApp('/dev/webcam')
    expect(
      await screen.findByText('알림이 생기면 그 순간의 짧은 영상만 서버로 보냅니다'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/새 알림이 만들어졌을 때만/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/7일/).length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText(/알림이 되지 않은 움직임의 영상은 저장하지 않습니다/).length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('알림에 영상 첨부 켜짐')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /그 순간의 영상/ })).toBeChecked()
    expect(
      screen.getByText(/조명 변화, 카메라 자동 밝기 조절, 흔들림을 구분하지 못합니다/),
    ).toBeInTheDocument()
    expect(screen.getByText('카메라 꺼짐')).toBeInTheDocument()
    expect(camera.getUserMedia).not.toHaveBeenCalled()

    const text = document.body.textContent ?? ''
    for (const phrase of FORBIDDEN_PHRASES) expect(text, phrase).not.toContain(phrase)
  })

  it('영상 첨부를 끄면 영상은 브라우저 밖으로 나가지 않는다고 알린다', async () => {
    installFakeCamera()
    stubApi(enabled())
    renderApp('/dev/webcam')
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: /그 순간의 영상/ }))
    expect(screen.getByText('카메라 영상은 이 브라우저 안에서만 처리합니다')).toBeInTheDocument()
    expect(screen.getByText(/영상을 저장하거나 서버로 보내지 않습니다/)).toBeInTheDocument()
    expect(screen.queryByText('알림에 영상 첨부 켜짐')).not.toBeInTheDocument()
  })

  it('기본은 3구역 나누기 + 민감도 "낮음"이다 (뒤척임으로 알림이 쌓이지 않게)', async () => {
    installFakeCamera()
    stubApi(enabled())
    renderApp('/dev/webcam')
    expect(await screen.findByLabelText('화면 나누기')).toHaveValue('split')
    expect(screen.getByLabelText('움직임 민감도')).toHaveValue('LOW')
    expect(screen.queryByLabelText('이 카메라가 보는 구역')).not.toBeInTheDocument()
  })

  it('카메라를 시작하면 마이크 없이 영상만 요청하고 세 구역의 센서를 먼저 만든다', async () => {
    const camera = installFakeCamera({ pattern: 'none' })
    const created: unknown[] = []
    stubApi(
      enabled({
        'POST /api/dev/simulator/sensors': (req) => {
          created.push(req.body)
          return jsonResponse(state())
        },
      }),
    )
    renderApp('/dev/webcam')
    await startCamera()
    expect(await screen.findByText('카메라 켜짐')).toBeInTheDocument()
    expect(camera.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.any(Object) as unknown }),
    )
    expect(created).toEqual([{}])
  })

  async function motionBodies(
    pattern: NonNullable<Parameters<typeof installFakeCamera>[0]>['pattern'],
    night: Record<string, unknown> = {},
  ) {
    installFakeCamera({ pattern })
    const sent: Array<{ zone: string; when: string }> = []
    stubApi(
      enabled(
        {
          'POST /api/dev/simulator/motion': (req) => {
            sent.push(req.body as { zone: string; when: string })
            return jsonResponse(state(night))
          },
        },
        night,
      ),
    )
    renderApp('/dev/webcam')
    await startCamera()
    await waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(1), { timeout: 5000 })
    await new Promise((resolve) => setTimeout(resolve, 600))
    return sent
  }

  it('화면 전체가 크게 움직이면 세 구역 모두 각자 한 번씩 신호를 보낸다', async () => {
    const sent = await motionBodies('all')
    expect(sent.map((s) => s.zone).sort()).toEqual(['BED_SIDE', 'ENTRANCE', 'PATH'])
    expect(sent.every((s) => s.when === 'now')).toBe(true) // 지금이 야간이므로
  }, 12_000)

  it('여러 칸이 거의 동시에 신호를 보내도 칸마다 계속 다시 보낼 수 있다 (첫 신호 뒤 멈추지 않는다)', async () => {
    installFakeCamera({ pattern: 'all' })
    const sent: string[] = []
    stubApi(
      enabled({
        'POST /api/dev/simulator/motion': (req) => {
          sent.push((req.body as { zone: string }).zone)
          return jsonResponse(state())
        },
      }),
    )
    renderApp('/dev/webcam')
    await startCamera()
    // 대기 시간(5초)이 지나면 각 칸이 두 번째 신호를 보낸다
    await waitFor(
      () => {
        for (const zone of ['BED_SIDE', 'PATH', 'ENTRANCE']) {
          expect(sent.filter((z) => z === zone).length).toBeGreaterThanOrEqual(2)
        }
      },
      { timeout: 12_000 },
    )
  }, 20_000)

  it('보이는 화면의 왼쪽(침대 칸)에서만 움직이면 침대 주변 신호만 보낸다 (거울 상 기준)', async () => {
    const sent = await motionBodies('rawRight')
    expect(sent.map((s) => s.zone)).toEqual(['BED_SIDE'])
  }, 12_000)

  it('보이는 화면의 오른쪽(현관 칸)에서만 움직이면 현관 신호만 보낸다', async () => {
    const sent = await motionBodies('rawLeft')
    expect(sent.map((s) => s.zone)).toEqual(['ENTRANCE'])
  }, 12_000)

  it('침대 칸에서 뒤척임처럼 짧게 끝나는 변화는 움직임으로 보내지 않는다', async () => {
    installFakeCamera({ pattern: 'burstBed' })
    let motionCalls = 0
    stubApi(
      enabled({
        'POST /api/dev/simulator/motion': () => {
          motionCalls += 1
          return jsonResponse(state())
        },
      }),
    )
    renderApp('/dev/webcam')
    await startCamera()
    await screen.findByText('카메라 켜짐')
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(motionCalls).toBe(0)
  }, 8000)

  it('현관 칸은 더 예민해서 짧게 지나가는 움직임(0.45초)도 신호를 보낸다', async () => {
    const sent = await motionBodies('burstDoor')
    expect(sent.map((s) => s.zone)).toEqual(['ENTRANCE'])
  }, 12_000)

  it('한 구역으로 쓰면 고른 구역으로만 신호를 보낸다', async () => {
    installFakeCamera()
    const sent: Array<{ zone: string }> = []
    const created: unknown[] = []
    stubApi(
      enabled({
        'POST /api/dev/simulator/sensors': (req) => {
          created.push(req.body)
          return jsonResponse(state())
        },
        'POST /api/dev/simulator/motion': (req) => {
          sent.push(req.body as { zone: string })
          return jsonResponse(state())
        },
      }),
    )
    renderApp('/dev/webcam')
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('화면 나누기'), 'single')
    await user.selectOptions(screen.getByLabelText('이 카메라가 보는 구역'), 'PATH')
    await user.click(screen.getByRole('button', { name: '카메라 시작' }))
    await waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(1), { timeout: 5000 })
    expect(created).toEqual([{ zone: 'PATH' }])
    expect(sent.every((s) => s.zone === 'PATH')).toBe(true)
  }, 12_000)

  it('지금이 야간이 아니면 "야간 시간으로 보내기"가 처음부터 켜져 있고 night 로 보낸다', async () => {
    const sent = await motionBodies('rawLeft', { isNightNow: false })
    expect(screen.getByRole('checkbox', { name: /가장 최근의 야간 시간으로 보내기/ })).toBeChecked()
    expect(sent[0]?.when).toBe('night')
  }, 12_000)

  it('지금이 야간이면 그 옵션은 꺼져 있고 지금 시각으로 보낸다', async () => {
    stubApi(enabled())
    renderApp('/dev/webcam')
    const box = await screen.findByRole('checkbox', { name: /가장 최근의 야간 시간으로 보내기/ })
    expect(box).not.toBeChecked()
    expect(
      screen.getByText(/지금은 야간 시간대라 켜지 않아도 알림 규칙이 적용됩니다/),
    ).toBeInTheDocument()
  })

  it('알림이 되는 경우를 구역별로 알려 준다: 현관은 알림, 침대 주변은 기록만(이유 포함)', async () => {
    stubApi(enabled())
    renderApp('/dev/webcam')
    expect(await screen.findByText('이 화면의 움직임이 알림이 되는 경우')).toBeInTheDocument()
    expect(screen.getByText(/즉시 확인 권장" 알림이 만들어집니다/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /침대 주변 움직임 하나만으로는 민감도가 "높음"일 때만 알려, 뒤척임으로 알림이 쌓이지 않게/,
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText('기록만').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('알림 생김')).toBeInTheDocument()
  })

  it('가구 민감도가 높음이면 침대 주변도 알림이 된다고 알린다', async () => {
    stubApi(enabled({}, { sensitivity: 'HIGH' }))
    renderApp('/dev/webcam')
    expect(await screen.findByText('이 화면의 움직임이 알림이 되는 경우')).toBeInTheDocument()
    // 서버 상태(민감도 높음)를 받은 뒤 침대 주변 + 현관 두 곳이 알림이 된다
    await waitFor(() => expect(screen.getAllByText('알림 생김')).toHaveLength(2))
  })

  it('야간이 아닌데 "야간 시간으로 보내기"를 끄면 모든 구역이 기록만 남는다고 알린다', async () => {
    stubApi(enabled({}, { isNightNow: false }))
    renderApp('/dev/webcam')
    const user = userEvent.setup()
    const box = await screen.findByRole('checkbox', { name: /가장 최근의 야간 시간으로 보내기/ })
    await waitFor(() => expect(box).toBeChecked()) // 야간이 아니라 처음부터 켜져 있다
    expect(screen.getByText('알림 생김')).toBeInTheDocument()
    await user.click(box)
    expect(screen.queryByText('알림 생김')).not.toBeInTheDocument()
    expect(screen.getAllByText(/알림은 만들어지지 않습니다/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('기록만').length).toBe(3)
  })

  it('움직임이 없는 화면에서는 아무것도 보내지 않는다', async () => {
    installFakeCamera({ pattern: 'none' })
    let motionCalls = 0
    stubApi(
      enabled({
        'POST /api/dev/simulator/motion': () => {
          motionCalls += 1
          return jsonResponse(state())
        },
      }),
    )
    renderApp('/dev/webcam')
    await startCamera()
    await screen.findByText('카메라 켜짐')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(motionCalls).toBe(0)
    expect(screen.getAllByText('움직임 없음').length).toBe(3)
  })

  it('카메라 끄기를 누르면 트랙을 멈추고, 화면을 떠나도 멈춘다', async () => {
    const camera = installFakeCamera({ pattern: 'none' })
    stubApi(enabled())
    const view = renderApp('/dev/webcam')
    const user = await startCamera()
    await screen.findByText('카메라 켜짐')
    await user.click(screen.getByRole('button', { name: '카메라 끄기' }))
    expect(camera.stop).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('카메라 꺼짐')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '카메라 시작' }))
    await screen.findByText('카메라 켜짐')
    view.unmount()
    expect(camera.stop).toHaveBeenCalledTimes(2)
  })

  it('카메라 사용이 거부되면 허용 방법을 알리고 켜진 것처럼 보이지 않는다', async () => {
    installFakeCamera({ rejectWith: 'NotAllowedError' })
    stubApi(enabled())
    renderApp('/dev/webcam')
    await startCamera()
    expect(await screen.findByRole('alert')).toHaveTextContent(/카메라 사용이 허용되지 않았습니다/)
    expect(screen.getByText('카메라 꺼짐')).toBeInTheDocument()
  })

  it('카메라가 없으면 그렇게 알린다', async () => {
    installFakeCamera({ rejectWith: 'NotFoundError' })
    stubApi(enabled())
    renderApp('/dev/webcam')
    await startCamera()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '사용할 수 있는 카메라를 찾지 못했습니다',
    )
  })

  it('이 브라우저·주소에서 카메라를 쓸 수 없으면 localhost 또는 https 를 안내한다', async () => {
    stubApi(enabled())
    renderApp('/dev/webcam')
    await startCamera()
    expect(await screen.findByRole('alert')).toHaveTextContent(/localhost 또는 https/)
  })

  it('설정 홈에서 시연이 켜져 있을 때만 링크가 보인다', async () => {
    stubApi(enabled())
    const first = renderApp('/settings')
    expect(await screen.findByRole('link', { name: /웹캠 움직임 감지/ })).toHaveAttribute(
      'href',
      '/dev/webcam',
    )
    first.unmount()
    stubApi(loggedInHandlers())
    renderApp('/settings')
    await screen.findByRole('link', { name: /연동 현황/ })
    expect(screen.queryByRole('link', { name: /웹캠 움직임 감지/ })).not.toBeInTheDocument()
  })
})

describe('웹캠: 알림에 영상 첨부', () => {
  /** 녹화를 흉내 낸다. stop 하면 작은 webm 조각 하나를 내놓는다. */
  class FakeRecorder extends EventTarget {
    static instances = 0
    static isTypeSupported = (type: string) => type.startsWith('video/webm')
    state: 'inactive' | 'recording' = 'inactive'
    mimeType: string
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      super()
      FakeRecorder.instances += 1
      this.mimeType = options?.mimeType ?? 'video/webm'
    }
    start() {
      this.state = 'recording'
    }
    stop() {
      if (this.state === 'inactive') return
      this.state = 'inactive'
      const event = Object.assign(new Event('dataavailable'), {
        data: new Blob([new Uint8Array(100)], { type: this.mimeType }),
      })
      this.dispatchEvent(event)
      this.dispatchEvent(new Event('stop'))
    }
  }

  const sendResult = (zone: string, newAlerts: { id: string }[]) => ({
    id: `r-${zone}`,
    at: '2026-11-20T01:00:00.000Z',
    zone,
    sensorName: `시뮬레이션 ${zone}`,
    label: '움직임 1건',
    ok: true,
    requests: [],
    newAlerts: newAlerts.map((a) => ({
      id: a.id,
      type: 'ENTRANCE_APPROACH',
      severity: 'URGENT',
      title: '현관 근처에서 움직임이 감지되었습니다',
    })),
    occurredAt: null,
    error: null,
  })

  beforeEach(() => {
    FakeRecorder.instances = 0
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function setup(options: { newAlerts: { id: string }[]; recorder?: boolean }) {
    installFakeCamera({ pattern: 'rawLeft' })
    if (options.recorder !== false) vi.stubGlobal('MediaRecorder', FakeRecorder)
    else vi.stubGlobal('MediaRecorder', undefined)
    const uploads: { path: string; search: string }[] = []
    const fetchMock = stubApi(
      enabled({
        'POST /api/dev/simulator/motion': () =>
          jsonResponse(
            makeSimulatorState({
              night: { start: '22:00', end: '06:00', isNightNow: true, sensitivity: 'MEDIUM' },
              recent: [sendResult('ENTRANCE', options.newAlerts)],
            }),
          ),
        ...Object.fromEntries(
          options.newAlerts.map((a) => [
            `POST /api/dev/simulator/alerts/${a.id}/clips`,
            ({ path, search }: { path: string; search: string }) => {
              uploads.push({ path, search })
              return jsonResponse(
                {
                  clip: {
                    id: `clip-${a.id}`,
                    alertId: a.id,
                    mimeType: 'video/webm',
                    sizeBytes: 100,
                    durationMs: 4000,
                    createdAt: '2026-11-20T01:00:05.000Z',
                    url: `/api/alerts/${a.id}/clips/clip-${a.id}`,
                  },
                },
                201,
              )
            },
          ]),
        ),
      }),
    )
    renderApp('/dev/webcam')
    return { uploads, fetchMock }
  }

  it('새 알림이 만들어지면 그 순간부터 녹화한 영상(webm)을 그 알림에 붙이고 알려 준다', async () => {
    const { uploads, fetchMock } = setup({ newAlerts: [{ id: 'a9' }] })
    await startCamera()
    await waitFor(() => expect(uploads).toHaveLength(1), { timeout: 9000 })
    expect(uploads[0]).toEqual({
      path: '/api/dev/simulator/alerts/a9/clips',
      search: '?durationMs=4000',
    })
    const call = fetchMock.mock.calls.find(([url]) => hrefOf(url).includes('/alerts/a9/clips'))
    const init = call?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('video/webm')
    expect(init.body).toBeInstanceOf(Blob)
    expect(
      await screen.findByText(/현관 알림 1건에 영상\(약 4초\)을 붙였습니다/),
    ).toBeInTheDocument()
  }, 15_000)

  it('알림이 새로 만들어지지 않으면 영상을 어디에도 보내지 않는다', async () => {
    const { fetchMock } = setup({ newAlerts: [] })
    await startCamera()
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(([url]) => hrefOf(url).includes('/dev/simulator/motion')),
        ).toBe(true),
      { timeout: 6000 },
    )
    await new Promise((resolve) => setTimeout(resolve, 4500))
    expect(fetchMock.mock.calls.some(([url]) => hrefOf(url).includes('/clips'))).toBe(false)
  }, 15_000)

  it('영상 첨부를 끄면 녹화하지 않고 알림만 보낸다', async () => {
    const { uploads } = setup({ newAlerts: [{ id: 'a9' }] })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: /그 순간의 영상/ }))
    await user.click(screen.getByRole('button', { name: '카메라 시작' }))
    await screen.findByText('카메라 켜짐')
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(FakeRecorder.instances).toBe(0)
    expect(uploads).toHaveLength(0)
  }, 10_000)

  it('브라우저가 녹화를 지원하지 않으면 알림만 보냈다고 숨기지 않고 알린다', async () => {
    const { uploads } = setup({ newAlerts: [{ id: 'a9' }], recorder: false })
    await startCamera()
    expect(
      await screen.findByText(
        '이 브라우저에서 영상을 녹화하지 못해 알림만 보냈습니다.',
        undefined,
        { timeout: 6000 },
      ),
    ).toBeInTheDocument()
    expect(uploads).toHaveLength(0)
  }, 10_000)
})
