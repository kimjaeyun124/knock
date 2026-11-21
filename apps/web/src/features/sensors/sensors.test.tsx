import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeSocketStatus } from '@/test/fakeSocket'
import { makeEvent, makeSensor } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

const sensorHandlers = (sensor = makeSensor(), extra: Record<string, ApiHandler> = {}) => ({
  ...loggedInHandlers(),
  'GET /api/sensors': () => jsonResponse({ sensors: [sensor] }),
  [`GET /api/sensors/${sensor.id}`]: () => jsonResponse({ sensor }),
  'GET /api/events': () => jsonResponse({ events: [makeEvent()], nextCursor: null }),
  ...extra,
})

const card = async (name: string) =>
  within((await screen.findByRole('heading', { name })).closest('li')!)

describe('센서 목록', () => {
  it('이름·위치·유형·사용 여부·연결·배터리·마지막 통신 시각과 상세 설정 버튼을 보여 준다', async () => {
    stubApi(sensorHandlers())
    renderApp('/sensors')
    const item = await card('침대 옆 센서(테스트)')
    expect(item.getByText(/침대 주변 · 움직임 감지 센서 · 사용 중/)).toBeInTheDocument()
    expect(item.getByText('연결됨')).toBeInTheDocument()
    expect(item.getByText('배터리 충분 (80%)')).toBeInTheDocument()
    expect(item.getByText(/마지막 통신/)).toBeInTheDocument()
    expect(item.getByRole('link', { name: '침대 옆 센서(테스트) 상세 설정' })).toHaveAttribute(
      'href',
      '/sensors/s1',
    )
  })

  it('연결 상태와 배터리는 독립이다: 연결 끊김+배터리 충분, 연결됨+배터리 부족을 각각 표현한다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () =>
        jsonResponse({
          sensors: [
            makeSensor({ id: 'a', name: '끊긴 센서', state: 'OFFLINE', batteryLevel: 'OK' }),
            makeSensor({
              id: 'b',
              name: '약한 센서',
              batteryLevel: 'LOW',
              batteryPercent: 15,
            }),
          ],
        }),
    })
    renderApp('/sensors')
    const offline = await card('끊긴 센서')
    expect(offline.getByText('연결 끊김')).toBeInTheDocument()
    expect(offline.getByText('배터리 충분 (80%)')).toBeInTheDocument()
    expect(offline.queryByText(/배터리가 부족합니다/)).not.toBeInTheDocument()

    const weak = await card('약한 센서')
    expect(weak.getByText('연결됨')).toBeInTheDocument()
    expect(weak.getByText('배터리 부족 (15%)')).toBeInTheDocument()
    expect(weak.getByText(/배터리가 부족합니다. 곧 교체하거나 충전해 주세요/)).toBeInTheDocument()
  })

  it('배터리 위급은 바로 교체하라고 더 강하게 알린다', async () => {
    stubApi(sensorHandlers(makeSensor({ batteryLevel: 'CRITICAL', batteryPercent: 4 })))
    renderApp('/sensors')
    expect(await screen.findByText(/바로 교체하거나 충전해 주세요/)).toBeInTheDocument()
  })

  it('문제가 있는 센서 수를 목록 위에서 먼저 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () =>
        jsonResponse({
          sensors: [
            makeSensor({ id: 'a', state: 'OFFLINE' }),
            makeSensor({ id: 'b', batteryLevel: 'LOW' }),
            makeSensor({ id: 'c' }),
          ],
        }),
    })
    renderApp('/sensors')
    expect(await screen.findByText('확인이 필요한 센서가 있습니다')).toBeInTheDocument()
    expect(screen.getByText('연결이 끊긴 센서 1개')).toBeInTheDocument()
    expect(screen.getByText('배터리가 부족한 센서 1개')).toBeInTheDocument()
  })

  it('꺼 둔 센서는 "사용 안 함"이고 배터리·연결 경고를 만들지 않는다', async () => {
    stubApi(
      sensorHandlers(
        makeSensor({ isActive: false, state: 'DISABLED', batteryLevel: 'LOW', batteryPercent: 9 }),
      ),
    )
    renderApp('/sensors')
    const item = await card('침대 옆 센서(테스트)')
    expect(item.getByText('사용 안 함', { selector: 'span span' })).toBeInTheDocument()
    expect(item.queryByText(/배터리가 부족합니다/)).not.toBeInTheDocument()
    expect(screen.queryByText('확인이 필요한 센서가 있습니다')).not.toBeInTheDocument()
  })

  it('시뮬레이션 센서는 실제 센서와 구분해 표시한다', async () => {
    stubApi(sensorHandlers(makeSensor({ origin: 'SIMULATED' })))
    renderApp('/sensors')
    expect((await card('침대 옆 센서(테스트)')).getByText('시뮬레이션')).toBeInTheDocument()
  })

  it('한 번도 신호가 없으면 그렇게 밝히고 배터리 정보를 지어내지 않는다', async () => {
    stubApi(
      sensorHandlers(
        makeSensor({
          state: 'PENDING',
          lastSeenAt: null,
          batteryLevel: 'UNKNOWN',
          batteryPercent: null,
        }),
      ),
    )
    renderApp('/sensors')
    expect(await screen.findByText('아직 신호를 받지 못했습니다')).toBeInTheDocument()
    expect(screen.getByText('배터리 정보 없음')).toBeInTheDocument()
    expect(screen.getByText('첫 신호 대기 중')).toBeInTheDocument()
  })

  it('센서가 없으면 빈 상태와 등록 버튼을, 실패하면 오류를 보여 준다', async () => {
    stubApi(loggedInHandlers())
    const first = renderApp('/sensors')
    expect(await screen.findByText('등록된 센서가 없습니다')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '센서 등록' })[0]).toHaveAttribute(
      'href',
      '/sensors/new',
    )
    first.unmount()
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/sensors')
    expect(await screen.findByText('센서를 불러오지 못했습니다')).toBeInTheDocument()
  })
})

const next = async () => userEvent.click(await screen.findByRole('button', { name: '다음' }))

describe('센서 등록: 단계별 안내', () => {
  it('유형 → 연결 방식 → 이름·위치 → 장치 연결 → 연결 확인 순서로 안내하고 현재 단계를 알린다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors/new')
    expect(await screen.findByText('1/5 단계 · 센서 유형')).toBeInTheDocument()
    const steps = within(screen.getByRole('navigation', { name: '등록 단계' }))
    expect(steps.getAllByRole('listitem')).toHaveLength(5)
    expect(steps.getByRole('listitem', { current: 'step' })).toHaveTextContent('센서 유형')

    expect(screen.getByRole('radio', { name: /움직임 감지 센서/ })).toBeChecked()
    await next()
    expect(screen.getByText('2/5 단계 · 연결 방식')).toBeInTheDocument()
    await next()
    expect(screen.getByText('3/5 단계 · 이름과 설치 위치')).toBeInTheDocument()
  })

  it('지원하지 않는 연결 방식은 이유와 함께 고를 수 없게 보여 준다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors/new')
    await next()
    expect(screen.getByRole('radio', { name: /장치 토큰으로 연결/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /블루투스·지그비/ })).toBeDisabled()
    expect(screen.getByText('아직 지원하지 않습니다.')).toBeInTheDocument()
    // 시뮬레이터가 꺼져 있으면 시뮬레이션 센서도 고를 수 없고 이유를 밝힌다
    expect(await screen.findByRole('radio', { name: /시뮬레이션 센서/ })).toBeDisabled()
    expect(screen.getByText('서버에서 시뮬레이터가 꺼져 있어 쓸 수 없습니다.')).toBeInTheDocument()
  })

  it('구역을 고르면 기본 이름이 채워지고, 직접 고친 이름은 덮어쓰지 않는다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors/new')
    await next()
    await next()
    const name = screen.getByLabelText('센서 이름')
    expect(name).toHaveValue('침대 주변 센서')
    await userEvent.selectOptions(screen.getByLabelText('설치 구역'), 'ENTRANCE')
    expect(name).toHaveValue('현관 센서')
    await userEvent.clear(name)
    await userEvent.type(name, '내가 정한 이름')
    await userEvent.selectOptions(screen.getByLabelText('설치 구역'), 'PATH')
    expect(name).toHaveValue('내가 정한 이름')
  })

  it('이름이 비어 있으면 다음 단계로 가지 않고 안내한다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors/new')
    await next()
    await next()
    await userEvent.clear(screen.getByLabelText('센서 이름'))
    await next()
    expect(await screen.findByText('센서 이름을 1~50자로 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('3/5 단계 · 이름과 설치 위치')).toBeInTheDocument()
  })

  it('이전 버튼으로 돌아가도 입력한 내용이 남아 있다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/sensors/new')
    await next()
    await next()
    await userEvent.selectOptions(screen.getByLabelText('설치 구역'), 'PATH')
    await next()
    expect(screen.getByText('4/5 단계 · 장치 연결')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByLabelText('설치 구역')).toHaveValue('PATH')
  })

  it('등록 전에 내용을 확인시키고, 등록하면 장치 토큰을 한 번만 보여 주고 저장소에 남기지 않는다', async () => {
    let body: unknown
    stubApi({
      ...loggedInHandlers(),
      'POST /api/sensors': (req) => {
        body = req.body
        return jsonResponse(
          {
            sensor: makeSensor({
              id: 'new1',
              name: '복도 센서',
              zone: 'PATH',
              state: 'PENDING',
              lastSeenAt: null,
              batteryLevel: 'UNKNOWN',
              batteryPercent: null,
            }),
            deviceToken: 'tsn_secret_value',
          },
          201,
        )
      },
    })
    renderApp('/sensors/new')
    await next()
    await next()
    await userEvent.selectOptions(screen.getByLabelText('설치 구역'), 'PATH')
    const name = screen.getByLabelText('센서 이름')
    await userEvent.clear(name)
    await userEvent.type(name, '복도 센서')
    await next()

    // 4단계: 확인 → 아직 요청하지 않았다
    expect(screen.getByText('내용을 확인하고 등록하세요')).toBeInTheDocument()
    expect(body).toBeUndefined()
    expect(screen.getByText('이동 경로')).toBeInTheDocument()
    expect(screen.getByText('복도 센서')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '센서 등록' }))
    expect(await screen.findByTestId('device-token')).toHaveTextContent('tsn_secret_value')
    expect(body).toEqual({ name: '복도 센서', zone: 'PATH' })
    expect(screen.getByText(/지금 한 번만 볼 수 있습니다/)).toBeInTheDocument()
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('tsn_secret_value')
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('tsn_secret_value')
    expect(window.location.href).not.toContain('tsn_secret_value')
    // 등록 후에는 되돌아갈 수 없다
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument()
  })

  it('실패하면 원인과 해결 방법을 알리고 토큰은 없다 (센서 수 제한)', async () => {
    stubApi({
      ...loggedInHandlers(),
      'POST /api/sensors': () =>
        errorResponse(409, 'CONFLICT', '센서는 최대 20개까지 등록할 수 있습니다.'),
    })
    renderApp('/sensors/new')
    await next()
    await next()
    await next()
    await userEvent.click(screen.getByRole('button', { name: '센서 등록' }))
    const alert = within(await screen.findByRole('alert'))
    expect(alert.getByText('센서를 등록하지 못했습니다.')).toBeInTheDocument()
    expect(alert.getByText(/센서는 최대 20개까지 등록할 수 있습니다/)).toBeInTheDocument()
    expect(alert.getByText(/사용하지 않는 센서를 연결 해제한 뒤/)).toBeInTheDocument()
    expect(screen.queryByTestId('device-token')).not.toBeInTheDocument()
    // 다시 시도할 수 있다
    expect(screen.getByRole('button', { name: '센서 등록' })).toBeEnabled()
  })

  it('등록 중에는 로딩 상태를 보여 주고 중복 등록을 막는다', async () => {
    let resolve: (response: Response) => void = () => undefined
    let posts = 0
    stubApi({
      ...loggedInHandlers(),
      'POST /api/sensors': () => {
        posts += 1
        return new Promise<Response>((r) => {
          resolve = r
        })
      },
    })
    renderApp('/sensors/new')
    await next()
    await next()
    await next()
    await userEvent.click(screen.getByRole('button', { name: '센서 등록' }))
    const busy = await screen.findByRole('button', { name: '등록하는 중…' })
    expect(busy).toBeDisabled()
    await userEvent.click(busy)
    expect(posts).toBe(1)
    resolve(
      jsonResponse({ sensor: makeSensor({ id: 'n', state: 'PENDING' }), deviceToken: 't' }, 201),
    )
    expect(await screen.findByTestId('device-token')).toBeInTheDocument()
  })

  it('연결 확인: 첫 신호가 없으면 해결 방법을 안내하고, 신호가 오면 연결되었다고 알린다', async () => {
    let signalled = false
    const created = makeSensor({
      id: 'new1',
      name: '현관 센서',
      state: 'PENDING',
      lastSeenAt: null,
      batteryLevel: 'UNKNOWN',
      batteryPercent: null,
    })
    stubApi({
      ...loggedInHandlers(),
      'POST /api/sensors': () => jsonResponse({ sensor: created, deviceToken: 'tsn_x' }, 201),
      'GET /api/sensors/new1': () =>
        jsonResponse({
          sensor: signalled
            ? makeSensor({ id: 'new1', name: '현관 센서', lastSeenAt: new Date().toISOString() })
            : created,
        }),
    })
    renderApp('/sensors/new')
    await next()
    await next()
    await next()
    await userEvent.click(screen.getByRole('button', { name: '센서 등록' }))
    await userEvent.click(await screen.findByRole('button', { name: '다음: 연결 확인' }))

    expect(await screen.findByText('아직 첫 신호를 받지 못했습니다')).toBeInTheDocument()
    expect(screen.getByText(/장치 토큰을 정확히 입력했는지/)).toBeInTheDocument()
    expect(screen.getByText('5/5 단계 · 연결 확인')).toBeInTheDocument()

    signalled = true
    await userEvent.click(screen.getByRole('button', { name: '지금 확인' }))
    expect(
      await screen.findByText('첫 신호를 받았습니다. 센서가 연결되었습니다'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '등록 마치기' })).toHaveAttribute(
      'href',
      '/sensors/new1',
    )
  })
})

describe('센서 등록: 시뮬레이션 분리', () => {
  const simulatorHandlers = (extra: Record<string, ApiHandler> = {}) => ({
    ...loggedInHandlers(),
    'GET /api/system/features': () => jsonResponse({ simulatorEnabled: true }),
    ...extra,
  })

  it('시뮬레이터가 켜져 있으면 고를 수 있고, 단계가 3단계로 줄며 실제 장치가 아니라고 알린다', async () => {
    stubApi(simulatorHandlers())
    renderApp('/sensors/new')
    await next()
    const radio = await screen.findByRole('radio', { name: /시뮬레이션 센서/ })
    await waitFor(() => expect(radio).toBeEnabled())
    await userEvent.click(radio)
    await next()
    expect(screen.getByText('3/3 단계 · 시뮬레이션 센서 만들기')).toBeInTheDocument()
    expect(screen.getByText('시뮬레이션 센서는 실제 장치가 아닙니다')).toBeInTheDocument()
    // 장치 토큰·이름 입력 같은 실제 장치용 단계는 나오지 않는다
    expect(screen.queryByLabelText('센서 이름')).not.toBeInTheDocument()
  })

  it('만들기를 누르면 시뮬레이션 센서를 준비하고 결과를 알린다', async () => {
    let created = 0
    stubApi(
      simulatorHandlers({
        'POST /api/dev/simulator/sensors': () => {
          created += 1
          return jsonResponse({
            sensors: ['BED_SIDE', 'PATH', 'ENTRANCE'].map((zone, index) => ({
              zone,
              sensor: makeSensor({ id: `sim${index}`, origin: 'SIMULATED' }),
              silenced: false,
              batteryPercent: 90,
            })),
            running: null,
            lastRun: null,
            deliveryFailure: { enabled: false, expiresAt: null },
            night: { start: '22:00', end: '06:00', isNightNow: true, sensitivity: 'MEDIUM' },
          })
        },
      }),
    )
    renderApp('/sensors/new')
    await next()
    const radio = await screen.findByRole('radio', { name: /시뮬레이션 센서/ })
    await waitFor(() => expect(radio).toBeEnabled())
    await userEvent.click(radio)
    await next()
    await userEvent.click(screen.getByRole('button', { name: '시뮬레이션 센서 만들기' }))
    expect(await screen.findByText('시뮬레이션 센서 3개가 준비되었습니다')).toBeInTheDocument()
    expect(created).toBe(1)
  })
})

describe('센서 상세', () => {
  it('유형·상태·배터리·마지막 통신·최근 신호를 보여 준다', async () => {
    stubApi(sensorHandlers())
    renderApp('/sensors/s1')
    expect(await screen.findByRole('heading', { name: '침대 옆 센서(테스트)' })).toBeInTheDocument()
    expect(await screen.findByText('최근 신호')).toBeInTheDocument()
    expect(screen.getByText(/침대 주변 · 움직임 감지 센서/)).toBeInTheDocument()
    expect(screen.getByText('연결됨')).toBeInTheDocument()
    expect(screen.getByText('마지막 통신')).toBeInTheDocument()
    expect(screen.getByText('알 수 없음')).toBeInTheDocument() // 펌웨어 정보가 없으면 지어내지 않는다
  })

  it('이름과 구역을 바꾸면 PATCH 로 보내고, 저장된 값을 화면에 바로 반영한다', async () => {
    let body: unknown
    let current = makeSensor()
    stubApi({
      ...sensorHandlers(),
      'GET /api/sensors/s1': () => jsonResponse({ sensor: current }),
      'PATCH /api/sensors/s1': (req) => {
        body = req.body
        current = makeSensor({ name: '새 이름', zone: 'PATH' })
        return jsonResponse({ sensor: current })
      },
    })
    renderApp('/sensors/s1')
    const input = await screen.findByLabelText('센서 이름')
    await userEvent.clear(input)
    await userEvent.type(input, '새 이름')
    await userEvent.selectOptions(screen.getByLabelText('설치 구역'), 'PATH')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(body).toEqual({ name: '새 이름', zone: 'PATH' }))
    expect(await screen.findByRole('heading', { name: '새 이름' })).toBeInTheDocument()
    expect(await screen.findByText('저장했습니다.')).toBeInTheDocument()
  })

  it('바꾼 내용이 없으면 저장 버튼이 꺼져 있다', async () => {
    stubApi(sensorHandlers())
    renderApp('/sensors/s1')
    expect(await screen.findByRole('button', { name: '저장' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('센서 이름'), '!')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  it('저장에 실패하면 이전 이름과 구역으로 되돌리고 원인과 해결 방법을 알린다', async () => {
    stubApi(
      sensorHandlers(makeSensor(), {
        'PATCH /api/sensors/s1': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      }),
    )
    renderApp('/sensors/s1')
    const input = await screen.findByLabelText('센서 이름')
    await userEvent.clear(input)
    await userEvent.type(input, '잘못 저장될 이름')
    await userEvent.selectOptions(screen.getByLabelText('설치 구역'), 'ENTRANCE')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    const alert = within(await screen.findByRole('alert'))
    expect(alert.getByText('저장하지 못해 이전 이름과 구역으로 되돌렸습니다.')).toBeInTheDocument()
    expect(alert.getByText(/서버에 문제가 생겨/)).toBeInTheDocument()
    expect(alert.getByText(/잠시 후 다시 시도/)).toBeInTheDocument()
    // 입력칸과 화면 제목 모두 저장 전 값이다
    expect(screen.getByLabelText('센서 이름')).toHaveValue('침대 옆 센서(테스트)')
    expect(screen.getByLabelText('설치 구역')).toHaveValue('BED_SIDE')
    expect(screen.getByRole('heading', { name: '침대 옆 센서(테스트)' })).toBeInTheDocument()
    expect(screen.queryByText('저장했습니다.')).not.toBeInTheDocument()
  })

  it('저장하는 동안 로딩 상태를 보여 주고 중복 저장을 막는다', async () => {
    let patches = 0
    let resolve: (response: Response) => void = () => undefined
    stubApi(
      sensorHandlers(makeSensor(), {
        'PATCH /api/sensors/s1': () => {
          patches += 1
          return new Promise<Response>((r) => {
            resolve = r
          })
        },
      }),
    )
    renderApp('/sensors/s1')
    await userEvent.type(await screen.findByLabelText('센서 이름'), '!')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    const busy = await screen.findByRole('button', { name: '저장하는 중…' })
    expect(busy).toBeDisabled()
    await userEvent.click(busy)
    expect(patches).toBe(1)
    resolve(jsonResponse({ sensor: makeSensor({ name: '침대 옆 센서(테스트)!' }) }))
    expect(await screen.findByText('저장했습니다.')).toBeInTheDocument()
  })

  it('사용 끄기는 확인 대화상자를 거쳐 isActive 만 보내고, 취소하면 보내지 않는다', async () => {
    const bodies: unknown[] = []
    let current = makeSensor()
    stubApi({
      ...sensorHandlers(),
      'GET /api/sensors/s1': () => jsonResponse({ sensor: current }),
      'PATCH /api/sensors/s1': (req) => {
        bodies.push(req.body)
        current = makeSensor({ isActive: false, state: 'DISABLED' })
        return jsonResponse({ sensor: current })
      },
    })
    renderApp('/sensors/s1')
    const toggle = await screen.findByRole('switch', { name: /이 센서 사용/ })
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText('이 센서 사용을 끌까요?')).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '취소' }))
    expect(bodies).toEqual([])
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '사용 끄기' }),
    )
    await waitFor(() => expect(bodies).toEqual([{ isActive: false }]))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /이 센서 사용/ })).not.toBeChecked(),
    )
  })

  it('다시 켜는 것은 확인 없이 바로 한다', async () => {
    const bodies: unknown[] = []
    stubApi(
      sensorHandlers(makeSensor({ isActive: false, state: 'DISABLED' }), {
        'PATCH /api/sensors/s1': (req) => {
          bodies.push(req.body)
          return jsonResponse({ sensor: makeSensor() })
        },
      }),
    )
    renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('switch', { name: /이 센서 사용/ }))
    await waitFor(() => expect(bodies).toEqual([{ isActive: true }]))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('사용 여부 변경이 실패하면 이전 상태로 되돌리고 원인과 해결 방법을 알린다', async () => {
    stubApi(
      sensorHandlers(makeSensor(), {
        'PATCH /api/sensors/s1': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      }),
    )
    renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('switch', { name: /이 센서 사용/ }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '사용 끄기' }),
    )
    expect(
      await screen.findByText('사용 여부를 바꾸지 못해 이전 상태로 되돌렸습니다.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('switch', { name: /이 센서 사용/ })).toBeChecked())
  })

  it('연결 상태 확인은 상태를 다시 읽어 확인한 시각과 결과를 알린다', async () => {
    let state: 'ONLINE' | 'OFFLINE' = 'ONLINE'
    stubApi({
      ...sensorHandlers(),
      'GET /api/sensors/s1': () => jsonResponse({ sensor: makeSensor({ state }) }),
    })
    renderApp('/sensors/s1')
    expect(await screen.findByText('연결됨')).toBeInTheDocument()
    state = 'OFFLINE'
    await userEvent.click(screen.getByRole('button', { name: '연결 상태 확인' }))
    expect(await screen.findByText(/에 확인했습니다: 연결 끊김/)).toBeInTheDocument()
    expect(screen.getByText(/센서에 직접 신호를 보내 확인하는 것은 아닙니다/)).toBeInTheDocument()
  })

  it('연결 상태를 확인하지 못하면 원인과 해결 방법을 알린다', async () => {
    let failing = false
    stubApi({
      ...sensorHandlers(),
      'GET /api/sensors/s1': () =>
        failing
          ? errorResponse(500, 'INTERNAL_ERROR', '서버 오류')
          : jsonResponse({ sensor: makeSensor() }),
    })
    renderApp('/sensors/s1')
    await screen.findByText('연결됨')
    failing = true
    await userEvent.click(screen.getByRole('button', { name: '연결 상태 확인' }))
    expect(await screen.findByText('연결 상태를 확인하지 못했습니다.')).toBeInTheDocument()
  })

  it('연결 해제는 확인 대화상자를 거치고, 사용 중이면 먼저 끈 뒤 삭제하고 목록으로 돌아간다', async () => {
    const calls: string[] = []
    stubApi(
      sensorHandlers(makeSensor(), {
        'PATCH /api/sensors/s1': () => {
          calls.push('deactivate')
          return jsonResponse({ sensor: makeSensor({ isActive: false, state: 'DISABLED' }) })
        },
        'DELETE /api/sensors/s1': () => {
          calls.push('delete')
          return jsonResponse({ ok: true, deletedEvents: 4 })
        },
      }),
    )
    const { router } = renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('button', { name: '센서 연결 해제' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(calls).toEqual([]) // 확인 전에는 아무것도 보내지 않는다
    expect(dialog.getByText(/되돌릴 수 없습니다/)).toBeInTheDocument()
    expect(dialog.getByText(/움직임 기록을 모두 지웁니다/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '연결 해제' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sensors'))
    expect(calls).toEqual(['deactivate', 'delete'])
  })

  it('이미 꺼 둔 센서는 바로 삭제한다', async () => {
    const calls: string[] = []
    stubApi(
      sensorHandlers(makeSensor({ isActive: false, state: 'DISABLED' }), {
        'DELETE /api/sensors/s1': () => {
          calls.push('delete')
          return jsonResponse({ ok: true, deletedEvents: 0 })
        },
      }),
    )
    const { router } = renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('button', { name: '센서 연결 해제' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '연결 해제' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/sensors'))
    expect(calls).toEqual(['delete'])
  })

  it('연결 해제를 취소하면 아무것도 바뀌지 않는다', async () => {
    const calls: string[] = []
    stubApi(
      sensorHandlers(makeSensor(), {
        'DELETE /api/sensors/s1': () => {
          calls.push('delete')
          return jsonResponse({ ok: true, deletedEvents: 0 })
        },
      }),
    )
    const { router } = renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('button', { name: '센서 연결 해제' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls).toEqual([])
    expect(router.state.location.pathname).toBe('/sensors/s1')
  })

  it('삭제가 실패하면 어디까지 되었는지, 원인과 해결 방법을 알린다', async () => {
    stubApi(
      sensorHandlers(makeSensor(), {
        'PATCH /api/sensors/s1': () =>
          jsonResponse({ sensor: makeSensor({ isActive: false, state: 'DISABLED' }) }),
        'DELETE /api/sensors/s1': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      }),
    )
    const { router } = renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('button', { name: '센서 연결 해제' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '연결 해제' }),
    )
    expect(
      await screen.findByText(
        '센서 사용은 꺼졌지만 삭제하지 못했습니다. 기록은 지워지지 않았습니다.',
      ),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sensors/s1')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('토큰 재발급은 확인 대화상자를 거친 뒤 새 토큰을 한 번 보여 준다', async () => {
    stubApi(
      sensorHandlers(makeSensor(), {
        'POST /api/sensors/s1/rotate-token': () =>
          jsonResponse({ sensor: makeSensor(), deviceToken: 'tsn_new_token' }),
      }),
    )
    renderApp('/sensors/s1')
    await userEvent.click(await screen.findByRole('button', { name: '토큰 재발급' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/기존 토큰은 바로 쓸 수 없게/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '새 토큰 발급' }))
    expect(await screen.findByTestId('device-token')).toHaveTextContent('tsn_new_token')
  })

  it('연결이 끊긴 센서와 배터리 부족은 서로 독립으로 함께 표시된다', async () => {
    stubApi(
      sensorHandlers(makeSensor({ state: 'OFFLINE', batteryLevel: 'LOW', batteryPercent: 12 })),
    )
    renderApp('/sensors/s1')
    expect(await screen.findByText('연결 끊김')).toBeInTheDocument()
    expect(screen.getByText('배터리 부족 (12%)')).toBeInTheDocument()
  })

  it('없는 센서는 서버 메시지를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors/zzz': () => errorResponse(404, 'NOT_FOUND', '센서를 찾을 수 없습니다.'),
    })
    renderApp('/sensors/zzz')
    expect(await screen.findByText('센서를 찾을 수 없습니다.')).toBeInTheDocument()
  })

  it('연결이 끊긴 동안 갱신에 실패해도 받아 둔 정보를 지금 상태처럼 보여 주지 않는다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(sensorHandlers())
    renderApp('/sensors/s1')
    expect(await screen.findByText('연결됨')).toBeInTheDocument()
    act(() => fakeSocketStatus.set('disconnected'))
    expect(await screen.findByLabelText('연결 안내')).toBeInTheDocument()
  })
})
