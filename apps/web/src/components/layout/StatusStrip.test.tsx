import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeSocketStatus } from '@/test/fakeSocket'
import { makeAlert, makeSensor } from '@/test/fixtures'
import {
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  testRuntime,
} from '@/test/helpers'

const strip = async () => within(await screen.findByLabelText('시스템 상태'))

const sensorsBody = (...sensors: ReturnType<typeof makeSensor>[]) => ({ sensors })
const alertsBody = (...alerts: ReturnType<typeof makeAlert>[]) => ({ alerts, nextCursor: null })

describe('상단 상태 띠', () => {
  it('센서가 모두 연결되어 있으면 그렇게 알리고 경고는 없다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () => jsonResponse(sensorsBody(makeSensor(), makeSensor({ id: 's2' }))),
    })
    renderApp('/')
    const bar = await strip()
    expect(await bar.findByText('센서 2개 모두 연결됨')).toBeInTheDocument()
    expect(bar.queryByText(/연결 끊긴 센서/)).not.toBeInTheDocument()
    expect(bar.queryByText(/알림 전달 실패/)).not.toBeInTheDocument()
    expect(bar.queryByText('일부 화면이 샘플 데이터입니다')).not.toBeInTheDocument()
  })

  it('연결이 끊긴 센서 수를 보여 주고 "모두 연결됨"은 숨긴다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () =>
        jsonResponse(sensorsBody(makeSensor(), makeSensor({ id: 's2', state: 'OFFLINE' }))),
    })
    renderApp('/')
    const bar = await strip()
    expect(await bar.findByText('연결 끊긴 센서 1개')).toBeInTheDocument()
    expect(bar.queryByText(/모두 연결됨/)).not.toBeInTheDocument()
  })

  it('알림 전달 실패가 남아 있으면 건수를 보여 준다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts': () =>
        jsonResponse(
          alertsBody(
            makeAlert({ id: 'd', type: 'DELIVERY_FAILED', title: '알림을 전달하지 못했습니다' }),
          ),
        ),
    })
    renderApp('/')
    expect(await (await strip()).findByText('알림 전달 실패 1건')).toBeInTheDocument()
  })

  it('센서 상태를 불러오지 못하면 "모두 연결됨"이 아니라 확인하지 못했다고 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/')
    const bar = await strip()
    expect(await bar.findByText('센서 상태를 확인하지 못했습니다')).toBeInTheDocument()
    expect(bar.queryByText(/모두 연결됨/)).not.toBeInTheDocument()
  })

  it('알림 목록을 불러오지 못하면 전달 실패가 없는 것처럼 보이지 않게 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/alerts': () => errorResponse(500, 'INTERNAL_ERROR', '서버 오류'),
    })
    renderApp('/')
    expect(await (await strip()).findByText('알림 상태를 확인하지 못했습니다')).toBeInTheDocument()
  })

  it('시뮬레이션 센서가 사용 중이면 실제 센서와 구분해 알린다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () =>
        jsonResponse(sensorsBody(makeSensor({ origin: 'SIMULATED' }), makeSensor({ id: 's2' }))),
    })
    renderApp('/')
    expect(await (await strip()).findByText('시뮬레이션 센서 1개 사용 중')).toBeInTheDocument()
  })

  it('사용 중인 센서가 없으면 그 사실을 알린다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(await (await strip()).findByText('사용 중인 센서 없음')).toBeInTheDocument()
  })

  it('Mock(샘플 데이터)이 켜져 있으면 상단에 항상 표시한다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/', testRuntime({ mockFeatures: ['integrations'] }))
    expect(await (await strip()).findByText('일부 화면이 샘플 데이터입니다')).toBeInTheDocument()
  })

  it('연결이 끊기면 받아 둔 센서 상태를 "모두 연결됨"처럼 보여 주지 않고 최신이 아니라고 알린다', async () => {
    fakeSocketStatus.set('disconnected')
    stubApi({
      ...loggedInHandlers(),
      'GET /api/sensors': () => jsonResponse(sensorsBody(makeSensor())),
    })
    renderApp('/')
    const bar = await strip()
    expect(await bar.findByText('센서·알림 상태는 최신이 아니어서 숨겼습니다')).toBeInTheDocument()
    expect(bar.queryByText(/모두 연결됨/)).not.toBeInTheDocument()
  })
})
