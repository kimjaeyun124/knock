import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { makeAlert, makeSensor, makeSimulatorState } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  type ApiHandler,
} from '@/test/helpers'

const enabled = (extra: Record<string, ApiHandler> = {}) => ({
  ...loggedInHandlers(),
  'GET /api/system/features': () => jsonResponse({ simulatorEnabled: true }),
  'GET /api/dev/simulator/state': () => jsonResponse(makeSimulatorState()),
  ...extra,
})

describe('설정 홈의 시뮬레이터 링크', () => {
  it('시뮬레이터가 켜져 있다고 확인된 때만 보인다', async () => {
    stubApi(enabled())
    const first = renderApp('/settings')
    expect(await screen.findByRole('link', { name: /센서 시뮬레이터/ })).toHaveAttribute(
      'href',
      '/dev/simulator',
    )
    first.unmount()

    stubApi(loggedInHandlers())
    renderApp('/settings')
    await screen.findByRole('link', { name: /연동 현황/ })
    expect(screen.queryByRole('link', { name: /센서 시뮬레이터/ })).not.toBeInTheDocument()
  })

  it('켜져 있는지 확인하지 못했을 때도 보이지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/system/features': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/settings')
    await screen.findByRole('link', { name: /연동 현황/ })
    expect(screen.queryByRole('link', { name: /센서 시뮬레이터/ })).not.toBeInTheDocument()
  })
})

describe('시뮬레이터 화면', () => {
  it('꺼져 있으면 그 이유를 알리고 상태를 요청하지 않는다', async () => {
    const fetchMock = stubApi(loggedInHandlers())
    renderApp('/dev/simulator')
    expect(await screen.findByText('시뮬레이터가 꺼져 있습니다')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.includes('/dev/simulator'),
      ),
    ).toBe(false)
  })

  it('켜져 있으면 시뮬레이션임을 분명히 밝히고 구역별 센서를 보여 준다', async () => {
    stubApi(enabled())
    renderApp('/dev/simulator')
    expect(await screen.findByText('시뮬레이션입니다. 실제 센서가 아닙니다')).toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: '움직임 보내기' })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: '연결 끊기' })).toHaveLength(3)
    // 시나리오 6종과 기대하는 결과
    expect(screen.getAllByRole('button', { name: /재생$/ })).toHaveLength(6)
    expect(screen.getAllByText(/기대하는 결과/)).toHaveLength(6)
  })

  it('야간 시간대가 아니면 알림이 만들어지지 않는다고 먼저 알린다', async () => {
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(
            makeSimulatorState({
              night: { start: '22:00', end: '06:00', isNightNow: false, sensitivity: 'LOW' },
            }),
          ),
      }),
    )
    renderApp('/dev/simulator')
    expect(await screen.findByText('지금은 야간 시간대가 아닙니다')).toBeInTheDocument()
    expect(screen.getByText(/기록만\s*남습니다/)).toBeInTheDocument()
  })

  it('센서가 아직 없으면 만들기 버튼을 보여 준다', async () => {
    let created = false
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(
            created
              ? makeSimulatorState()
              : makeSimulatorState({
                  sensors: ['BED_SIDE', 'PATH', 'ENTRANCE'].map((zone) => ({
                    zone,
                    sensor: null,
                    silenced: false,
                    batteryPercent: null,
                  })),
                }),
          ),
        'POST /api/dev/simulator/sensors': () => {
          created = true
          return jsonResponse(makeSimulatorState())
        },
      }),
    )
    renderApp('/dev/simulator')
    await userEvent.click(await screen.findByRole('button', { name: '시뮬레이션 센서 만들기' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '시뮬레이션 센서 만들기' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('움직임·배터리·연결 끊기를 알맞은 API 로 보낸다', async () => {
    const calls: string[] = []
    const record =
      (name: string): ApiHandler =>
      (req) => {
        calls.push(`${name} ${JSON.stringify(req.body)}`)
        return jsonResponse(makeSimulatorState())
      }
    stubApi(
      enabled({
        'POST /api/dev/simulator/motion': record('motion'),
        'POST /api/dev/simulator/battery': record('battery'),
        'POST /api/dev/simulator/silence': record('silence'),
      }),
    )
    renderApp('/dev/simulator')
    const buttons = await screen.findAllByRole('button', { name: '움직임 보내기' })
    await userEvent.click(buttons[2]!)
    await userEvent.click(screen.getAllByRole('button', { name: '배터리 9%' })[0]!)
    await userEvent.click(screen.getAllByRole('button', { name: '연결 끊기' })[1]!)
    await waitFor(() =>
      expect(calls).toEqual([
        'motion {"zone":"ENTRANCE","mode":"single","when":"now"}',
        'battery {"zone":"BED_SIDE","batteryPercent":9}',
        'silence {"zone":"PATH","silenced":true}',
      ]),
    )
  })

  it('끊은 센서는 상태에 표시되고 "연결 복구"로 바뀐다', async () => {
    const state = makeSimulatorState()
    state.sensors[0] = { ...state.sensors[0]!, silenced: true }
    stubApi(enabled({ 'GET /api/dev/simulator/state': () => jsonResponse(state) }))
    renderApp('/dev/simulator')
    expect(await screen.findByText('신호를 보내지 않는 중')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '연결 복구' })).toBeInTheDocument()
  })

  it('선택한 배속으로 시나리오 재생을 요청한다', async () => {
    let body: unknown
    stubApi(
      enabled({
        'POST /api/dev/simulator/scenarios/entrance/run': (req) => {
          body = req.body
          return jsonResponse(makeSimulatorState())
        },
      }),
    )
    renderApp('/dev/simulator')
    await userEvent.click(await screen.findByRole('radio', { name: '10×' }))
    await userEvent.click(screen.getByRole('button', { name: '현관 근처 움직임 재생' }))
    await waitFor(() => expect(body).toEqual({ speed: 10 }))
  })

  it('재생 중에는 진행 상황을 보여 주고 다른 재생을 막으며 멈출 수 있다', async () => {
    let stopped = false
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(
            stopped
              ? makeSimulatorState({
                  lastRun: {
                    scenarioId: 'bed-to-path',
                    endedAt: '2026-11-14T17:05:00.000Z',
                    outcome: 'STOPPED',
                    error: null,
                  },
                })
              : makeSimulatorState({
                  running: {
                    scenarioId: 'bed-to-path',
                    speed: 10,
                    startedAt: '2026-11-14T17:00:00.000Z',
                    completedSteps: 1,
                    totalSteps: 2,
                  },
                }),
          ),
        'POST /api/dev/simulator/scenarios/stop': () => {
          stopped = true
          return jsonResponse(
            makeSimulatorState({
              lastRun: {
                scenarioId: 'bed-to-path',
                endedAt: '2026-11-14T17:05:00.000Z',
                outcome: 'STOPPED',
                error: null,
              },
            }),
          )
        },
      }),
    )
    renderApp('/dev/simulator')
    expect(await screen.findByText('1/2 단계 · 10배속')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button', { name: /재생$/ }))
      expect(button).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '멈추기' }))
    expect(await screen.findByText(/마지막 재생: .*멈춤/)).toBeInTheDocument()
  })

  it('재생이 실패했으면 이유와 함께 숨기지 않고 보여 준다', async () => {
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(
            makeSimulatorState({
              lastRun: {
                scenarioId: 'entrance',
                endedAt: '2026-11-14T17:05:00.000Z',
                outcome: 'FAILED',
                error: '수집 API 에 신호를 보내지 못했습니다.',
              },
            }),
          ),
      }),
    )
    renderApp('/dev/simulator')
    expect(
      await screen.findByText(/실패 \(수집 API 에 신호를 보내지 못했습니다\.\)/),
    ).toBeInTheDocument()
  })

  it('서버가 거부하면(예: 이미 재생 중) 메시지를 보여 준다', async () => {
    stubApi(
      enabled({
        'POST /api/dev/simulator/scenarios/entrance/run': () =>
          errorResponse(409, 'CONFLICT', '이미 시나리오를 재생 중입니다. 먼저 멈춰 주세요.'),
      }),
    )
    renderApp('/dev/simulator')
    await userEvent.click(await screen.findByRole('button', { name: '현관 근처 움직임 재생' }))
    expect(
      await screen.findByText('이미 시나리오를 재생 중입니다. 먼저 멈춰 주세요.'),
    ).toBeInTheDocument()
  })

  it('전달 실패 주입을 켜고 끄며, 켜져 있으면 자동으로 꺼지는 시각을 알린다', async () => {
    let enabledNow = false
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(
            makeSimulatorState({
              deliveryFailure: {
                enabled: enabledNow,
                expiresAt: enabledNow ? '2026-11-14T17:10:00.000Z' : null,
              },
            }),
          ),
        'POST /api/dev/simulator/faults': (req) => {
          enabledNow = (req.body as { deliveryFailure: boolean }).deliveryFailure
          return jsonResponse(
            makeSimulatorState({
              deliveryFailure: {
                enabled: enabledNow,
                expiresAt: enabledNow ? '2026-11-14T17:10:00.000Z' : null,
              },
            }),
          )
        },
      }),
    )
    renderApp('/dev/simulator')
    await userEvent.click(await screen.findByRole('button', { name: '전달 실패 주입 켜기' }))
    expect(await screen.findByText(/주입 중 · .*자동으로 꺼짐/)).toBeInTheDocument()
    expect(screen.getByText(/실제 센서가 만든\s*알림에는 영향이 없습니다/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '전달 실패 주입 끄기' }))
    await waitFor(() => expect(screen.queryByText(/주입 중/)).not.toBeInTheDocument())
  })

  it('상태를 불러오지 못하면 오류를 보여 주고 버튼을 그리지 않는다', async () => {
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
      }),
    )
    renderApp('/dev/simulator')
    expect(await screen.findByText('시뮬레이터 상태를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '움직임 보내기' })).not.toBeInTheDocument()
  })

  it('화면 문구에 확정적 표현이 없다', async () => {
    stubApi(enabled())
    renderApp('/dev/simulator')
    await screen.findByText('시뮬레이션입니다. 실제 센서가 아닙니다')
    const text = screen.getByRole('main').textContent ?? ''
    for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
  })
})

describe('데이터 관리 화면', () => {
  const summary = (simulated = { sensors: 3, events: 12, alerts: 2 }) =>
    jsonResponse({ real: { sensors: 2, events: 40, alerts: 5 }, simulated })

  it('실제와 시뮬레이션 데이터 양을 따로 보여 준다', async () => {
    stubApi({ ...loggedInHandlers(), 'GET /api/data/summary': () => summary() })
    renderApp('/settings/data')
    expect(await screen.findByText('센서 2개 · 움직임 기록 40건 · 알림 5건')).toBeInTheDocument()
    expect(screen.getByText('센서 3개 · 움직임 기록 12건 · 알림 2건')).toBeInTheDocument()
  })

  it('삭제는 한 번 더 확인한 뒤에만 요청하고, 결과를 알린다', async () => {
    const calls: string[] = []
    stubApi({
      ...loggedInHandlers(),
      'GET /api/data/summary': () => summary(),
      'DELETE /api/data/simulated': () => {
        calls.push('delete')
        return jsonResponse({ ok: true, deleted: { sensors: 3, events: 12, alerts: 2 } })
      },
    })
    renderApp('/settings/data')
    await userEvent.click(await screen.findByRole('button', { name: '시뮬레이션 데이터 삭제' }))
    expect(calls).toEqual([])
    const confirm = screen
      .getByText('시뮬레이션 데이터를 영구 삭제합니다')
      .closest('div') as HTMLElement
    expect(within(confirm).getByText('되돌릴 수 없습니다.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '영구 삭제' }))
    expect(
      await screen.findByText(/지웠습니다\. \(센서 3개, 움직임 기록 12건, 알림 2건\)/),
    ).toBeInTheDocument()
    expect(calls).toEqual(['delete'])
  })

  it('지울 시뮬레이션 데이터가 없으면 삭제 버튼이 꺼져 있다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/data/summary': () => summary({ sensors: 0, events: 0, alerts: 0 }),
    })
    renderApp('/settings/data')
    const button = await screen.findByRole('button', { name: '시뮬레이션 데이터 삭제' })
    await waitFor(() => expect(button).toBeDisabled())
  })

  it('삭제에 실패하면 서버 메시지를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/data/summary': () => summary(),
      'DELETE /api/data/simulated': () =>
        errorResponse(500, 'INTERNAL_ERROR', '서버에서 문제가 발생했습니다.'),
    })
    renderApp('/settings/data')
    await userEvent.click(await screen.findByRole('button', { name: '시뮬레이션 데이터 삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '영구 삭제' }))
    expect(await screen.findByText('서버에서 문제가 발생했습니다.')).toBeInTheDocument()
  })

  it('양을 불러오지 못하면 0 으로 보이지 않고 오류를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/data/summary': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/settings/data')
    expect(await screen.findByText('데이터 양을 불러오지 못했습니다')).toBeInTheDocument()
  })
})

describe('시뮬레이션 알림 표시', () => {
  it('시뮬레이션으로 만든 알림이 대시보드의 큰 상태를 만들면 실제 상황이 아니라고 밝힌다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () => jsonResponse({ sensors: [makeSensor({ origin: 'SIMULATED' })] }),
      'GET /api/alerts': () =>
        jsonResponse({ alerts: [makeAlert({ origin: 'SIMULATED' })], nextCursor: null }),
    })
    renderApp('/')
    const panel = within(await screen.findByRole('alert', { name: '현재 상태' }))
    expect(
      panel.getByText('시뮬레이션으로 만들어진 알림입니다. 실제 상황이 아닙니다.'),
    ).toBeInTheDocument()
  })

  it('실제 알림에는 그 문구가 없다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () => jsonResponse({ sensors: [makeSensor()] }),
      'GET /api/alerts': () => jsonResponse({ alerts: [makeAlert()], nextCursor: null }),
    })
    renderApp('/')
    const panel = within(await screen.findByRole('alert', { name: '현재 상태' }))
    expect(panel.queryByText(/시뮬레이션으로 만들어진/)).not.toBeInTheDocument()
  })
})

const SENT = {
  id: 'r1',
  at: '2026-11-17T03:00:00.000Z',
  zone: 'ENTRANCE',
  sensorName: '시뮬레이션 현관',
  label: '움직임 1건 (같은 이벤트를 두 번 전송)',
  ok: true,
  requests: [
    { eventId: 'aaaaaaaa-1111', status: 'ACCEPTED', reason: null },
    { eventId: 'aaaaaaaa-1111', status: 'DUPLICATE', reason: null },
  ],
  newAlerts: [
    {
      id: 'a1',
      type: 'ENTRANCE_APPROACH',
      severity: 'URGENT',
      title: '현관 근처에서 움직임이 감지되었습니다',
    },
  ],
  occurredAt: null,
  error: null,
}

describe('시뮬레이터: 전송 방식·결과·기록', () => {
  const record =
    (calls: unknown[]): ApiHandler =>
    (req) => {
      calls.push(req.body)
      return jsonResponse(makeSimulatorState())
    }

  it('전송 방식을 고르면 그 방식으로 움직임을 보낸다 (중복·반복·야간)', async () => {
    const calls: unknown[] = []
    stubApi(enabled({ 'POST /api/dev/simulator/motion': record(calls) }))
    renderApp('/dev/simulator')
    const send = (await screen.findAllByRole('button', { name: '움직임 보내기' }))[1]!

    await userEvent.selectOptions(screen.getByLabelText('전송 방식'), 'duplicate')
    await userEvent.click(send)
    await userEvent.selectOptions(screen.getByLabelText('전송 방식'), 'burst')
    const count = screen.getByLabelText('건수 (2~20)')
    await userEvent.clear(count)
    await userEvent.type(count, '7')
    await userEvent.click(screen.getByRole('checkbox', { name: /야간 시간으로 보내기/ }))
    await userEvent.click(send)

    await waitFor(() =>
      expect(calls).toEqual([
        { zone: 'PATH', mode: 'duplicate', when: 'now' },
        { zone: 'PATH', mode: 'burst', count: 7, when: 'night' },
      ]),
    )
  })

  it('반복 전송 건수가 범위 밖이면 보내지 않고 알린다', async () => {
    const calls: unknown[] = []
    stubApi(enabled({ 'POST /api/dev/simulator/motion': record(calls) }))
    renderApp('/dev/simulator')
    await userEvent.selectOptions(await screen.findByLabelText('전송 방식'), 'burst')
    const count = screen.getByLabelText('건수 (2~20)')
    await userEvent.clear(count)
    await userEvent.type(count, '99')
    expect(screen.getByText('2~20 사이의 정수를 입력해 주세요.')).toBeInTheDocument()
    await userEvent.click((await screen.findAllByRole('button', { name: '움직임 보내기' }))[0]!)
    expect(await screen.findByText('건수를 2~20 사이의 정수로 입력해 주세요.')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('센서를 구역마다 만들고, 확인한 뒤 연결 해제한다', async () => {
    const created: unknown[] = []
    let removed = 0
    const state = makeSimulatorState()
    state.sensors[0] = { ...state.sensors[0]!, sensor: null as never }
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () => jsonResponse(state),
        'POST /api/dev/simulator/sensors': (req) => {
          created.push(req.body)
          return jsonResponse(state)
        },
        'DELETE /api/dev/simulator/sensors/PATH': () => {
          removed += 1
          return jsonResponse(state)
        },
      }),
    )
    renderApp('/dev/simulator')
    await userEvent.click(await screen.findByRole('button', { name: '침대 주변 센서 만들기' }))
    await waitFor(() => expect(created).toEqual([{ zone: 'BED_SIDE' }]))

    await userEvent.click(screen.getByRole('button', { name: '이동 경로 센서 연결 해제' }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/움직임 기록이 함께 삭제됩니다/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: '취소' }))
    expect(removed).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: '이동 경로 센서 연결 해제' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '연결 해제' }),
    )
    await waitFor(() => expect(removed).toBe(1))
  })

  it('"끊김 바로 확인"은 fastForward 로 보내고, 배터리는 직접 입력한 값으로 적용한다', async () => {
    const silence: unknown[] = []
    const battery: unknown[] = []
    stubApi(
      enabled({
        'POST /api/dev/simulator/silence': record(silence),
        'POST /api/dev/simulator/battery': record(battery),
      }),
    )
    renderApp('/dev/simulator')
    await userEvent.click(await screen.findByRole('button', { name: '현관 끊김 바로 확인' }))
    await waitFor(() =>
      expect(silence).toEqual([{ zone: 'ENTRANCE', silenced: true, fastForward: true }]),
    )

    const apply = screen.getByRole('button', { name: '침대 주변 배터리 값 적용' })
    expect(apply).toBeDisabled()
    await userEvent.type(screen.getAllByLabelText('배터리 직접 입력 (%)')[0]!, '10')
    await userEvent.click(apply)
    await waitFor(() => expect(battery).toEqual([{ zone: 'BED_SIDE', batteryPercent: 10 }]))
  })

  it('전송 결과(저장됨·중복·새 알림)와 최근 전송 기록을 보여 준다', async () => {
    const older = {
      ...SENT,
      id: 'r0',
      at: '2026-11-17T02:59:00.000Z',
      label: '움직임 1건',
      requests: [{ eventId: 'bbbbbbbb-2222', status: 'ACCEPTED', reason: null }],
      newAlerts: [],
    }
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(makeSimulatorState({ recent: [SENT, older] })),
      }),
    )
    renderApp('/dev/simulator')
    const result = within(
      (await screen.findByRole('heading', { name: '전송 결과' })).closest('section')!,
    )
    expect(result.getByText('서버가 처리했습니다')).toBeInTheDocument()
    expect(result.getByText('저장됨')).toBeInTheDocument()
    expect(result.getByText('중복이라 저장하지 않음')).toBeInTheDocument()
    expect(
      result.getByText(/현관 근처 움직임 — 현관 근처에서 움직임이 감지되었습니다/),
    ).toBeInTheDocument()

    const log = within(
      screen.getByRole('heading', { name: '최근 전송 이벤트 기록' }).closest('section')!,
    )
    expect(log.getAllByRole('listitem')).toHaveLength(2)
    expect(log.getByText('중복 있음')).toBeInTheDocument()
    expect(log.getByText('알림 1건 생성')).toBeInTheDocument()
  })

  it('전송에 실패한 기록은 실패와 이유를 보여 주고, 기록이 없으면 안내한다', async () => {
    stubApi(
      enabled({
        'GET /api/dev/simulator/state': () =>
          jsonResponse(
            makeSimulatorState({
              recent: [
                {
                  ...SENT,
                  ok: false,
                  requests: [],
                  newAlerts: [],
                  error: '수집 API 에 신호를 보내지 못했습니다.',
                },
              ],
            }),
          ),
      }),
    )
    const first = renderApp('/dev/simulator')
    expect(await screen.findByText('전송에 실패했습니다')).toBeInTheDocument()
    expect(screen.getAllByText('수집 API 에 신호를 보내지 못했습니다.').length).toBeGreaterThan(0)
    first.unmount()

    stubApi(enabled())
    renderApp('/dev/simulator')
    expect(
      await screen.findByText('아직 보낸 신호가 없습니다. 위에서 움직임을 보내 보세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('기록이 없습니다.')).toBeInTheDocument()
  })
})
