import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_PHRASES } from '@tetris/shared'
import { composeApiClient } from '@/services/api/features'
import { createHttpApiClient } from '@/services/api/http'
import { createMockApiClient } from '@/services/api/mock'
import { fakeSocket, fakeSocketStatus } from '@/test/fakeSocket'
import { makeAlert, makeEvent, makeSensor } from '@/test/fixtures'
import {
  dailyBody,
  errorResponse,
  jsonResponse,
  loggedInHandlers,
  renderApp,
  stubApi,
  testRuntime,
} from '@/test/helpers'

const THREE_SENSORS = [
  makeSensor({ id: 'bed', zone: 'BED_SIDE', name: '침대 센서(테스트)' }),
  makeSensor({
    id: 'path',
    zone: 'PATH',
    name: '복도 센서(테스트)',
    batteryLevel: 'LOW',
    batteryPercent: 14,
  }),
  makeSensor({ id: 'door', zone: 'ENTRANCE', name: '현관 센서(테스트)' }),
]

const withSensors = (sensors = THREE_SENSORS) => ({
  ...loggedInHandlers(),
  'GET /api/sensors': () => jsonResponse({ sensors }),
})

/** 대시보드가 다 그려졌을 때만 있는 요소 */
const loaded = () => screen.findByRole('heading', { name: '최근 7일 움직임' })

describe('대시보드: Success', () => {
  it('인사·날짜·모니터링 여부·마지막 데이터 수신 시각을 맨 위에 보여 준다', async () => {
    stubApi(withSensors())
    renderApp('/')
    await loaded()
    expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument()
    expect(screen.getByText('안녕하세요. 오늘의 안전 상태를 확인하세요.')).toBeInTheDocument()
    expect(screen.getByText(/\d{4}년 \d+월 \d+일 .요일 · /)).toBeInTheDocument()
    expect(screen.getByText('모니터링 켜짐')).toBeInTheDocument()
    expect(screen.getByText(/마지막 데이터 수신:/)).toBeInTheDocument()
  })

  it('알림이 없을 때 "안전"을 보장하지 않고 관측한 사실로만 표현한다', async () => {
    stubApi(withSensors([makeSensor({ id: 'a' })]))
    renderApp('/')
    const card = within(await screen.findByLabelText('현재 상태'))
    expect(card.getByText('정상')).toBeInTheDocument()
    expect(card.getByText('최근 감지된 주의 이벤트가 없습니다')).toBeInTheDocument()
    expect(card.getByText(/마지막 업데이트:/)).toBeInTheDocument()
    await loaded()
    for (const phrase of FORBIDDEN_PHRASES) expect(document.body.textContent).not.toContain(phrase)
  })

  it('현재 모니터링 카드: 시작 시각, 감지 일정, 야간 여부, 연결·정상 작동 센서 수', async () => {
    stubApi(withSensors())
    renderApp('/')
    const card = within(
      (await screen.findByRole('heading', { name: '현재 모니터링' })).closest('section')!,
    )
    expect(card.getByText('매일 오후 10:00 ~ 오전 6:00')).toBeInTheDocument()
    expect(card.getByText('첫 센서를 등록한 시각')).toBeInTheDocument()
    expect(card.getByText(/지금 야간 시간대입니다|오후 10:00에 시작합니다/)).toBeInTheDocument()
    // 3개 연결, 그중 배터리가 부족한 1개는 "정상 작동"에서 빠진다
    expect(card.getByText('연결된 센서').nextElementSibling).toHaveTextContent('3개 / 사용 중 3개')
    expect(card.getByText('정상 작동 중인 센서').nextElementSibling).toHaveTextContent('2개')
    expect(card.getByText(/배터리가 부족한 센서 1개 제외/)).toBeInTheDocument()
  })

  it('최근 움직임: 최대 5건을 시각·위치·종류·주의 수준과 함께 보여 주고 전체 기록으로 이어진다', async () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      makeEvent({
        id: `e${index}`,
        zone: index === 0 ? 'ENTRANCE' : 'BED_SIDE',
        occurredAt: new Date(Date.now() - index * 3_600_000).toISOString(),
      }),
    )
    stubApi({
      ...withSensors(),
      'GET /api/events': () => jsonResponse({ events, nextCursor: null }),
    })
    renderApp('/')
    const card = within(
      (await screen.findByRole('heading', { name: '최근 움직임' })).closest('section')!,
    )
    expect(await card.findAllByRole('listitem')).toHaveLength(5)
    expect(card.getByText(/현관 · 움직임 감지/)).toBeInTheDocument()
    expect(card.getAllByText(/야간 감지|주간 감지/)).toHaveLength(5)
    expect(card.getByRole('link', { name: '전체 기록 보기' })).toHaveAttribute('href', '/events')
  })

  it('최근 움직임이 없으면 빈 상태를 보여 주되 전체 기록 버튼은 남긴다', async () => {
    stubApi(withSensors())
    renderApp('/')
    const card = within(
      (await screen.findByRole('heading', { name: '최근 움직임' })).closest('section')!,
    )
    expect(await card.findByText('최근 감지된 움직임이 없습니다')).toBeInTheDocument()
    expect(card.getByRole('link', { name: '전체 기록 보기' })).toBeInTheDocument()
  })

  it('센서 요약: 구역별로 연결 상태와 배터리를 따로 보여 준다 (연결 정상 + 배터리 부족)', async () => {
    stubApi(withSensors([THREE_SENSORS[0]!, THREE_SENSORS[1]!]))
    renderApp('/')
    const card = within(
      (await screen.findByRole('heading', { name: '센서 요약' })).closest('section')!,
    )
    expect(card.getByText('침대 주변')).toBeInTheDocument()
    expect(card.getByText('이동 경로')).toBeInTheDocument()
    expect(card.getByText('현관')).toBeInTheDocument()
    expect(card.getByText(/이 구역에는 센서가 없습니다/)).toBeInTheDocument() // 현관
    const path = within(card.getByText('복도 센서(테스트)').closest('li')!)
    expect(path.getByText('연결됨')).toBeInTheDocument()
    expect(path.getByText('배터리 부족 (14%)')).toBeInTheDocument()
    expect(card.getByRole('link', { name: '복도 센서(테스트)' })).toHaveAttribute(
      'href',
      '/sensors/path',
    )
  })

  it('최근 7일: 날짜별 감지 건수와 주의 이벤트를 숫자·범례·표로 제공한다', async () => {
    stubApi({
      ...withSensors(),
      'GET /api/events/daily': () =>
        jsonResponse(dailyBody([3, 0, 5, 1, 0, 2, 4], [0, 0, 1, 0, 0, 0, 2])),
    })
    renderApp('/')
    const card = within(
      (await screen.findByRole('heading', { name: '최근 7일 움직임' })).closest('section')!,
    )
    expect(await card.findByText(/7일 동안 움직임 신호 15건, 주의 이벤트 3건/)).toBeInTheDocument()
    // 범례(눈으로 보는 것)와 표 머리글(스크린리더용)에 각각 있다
    expect(card.getAllByText('감지 건수')).toHaveLength(2)
    expect(card.getAllByText('주의 이벤트')).toHaveLength(2)
    const table = card.getByRole('table', { name: /날짜별 움직임 신호 수/ })
    expect(within(table).getAllByRole('row')).toHaveLength(8) // 머리글 + 7일
    expect(card.getByText('오늘')).toBeInTheDocument()
  })

  it('최근 7일에 기록이 하나도 없으면 빈 상태를 보여 준다', async () => {
    stubApi(withSensors())
    renderApp('/')
    expect(await screen.findByText('최근 7일 동안 기록된 움직임이 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('빠른 작업: 센서 관리·알림 설정·전체 기록으로 이동할 수 있다', async () => {
    stubApi(withSensors())
    renderApp('/')
    const card = within(
      (await screen.findByRole('heading', { name: '빠른 작업' })).closest('section')!,
    )
    expect(card.getByRole('link', { name: /센서 관리/ })).toHaveAttribute('href', '/sensors')
    expect(card.getByRole('link', { name: /알림 설정/ })).toHaveAttribute(
      'href',
      '/settings/notifications',
    )
    expect(card.getByRole('link', { name: /전체 기록 확인/ })).toHaveAttribute('href', '/events')
  })

  it('긴급 알림이 있으면 "확인 필요"와 "즉시 확인 권장", 알림 센터 링크를 보여 준다', async () => {
    stubApi({
      ...withSensors(),
      'GET /api/alerts': () => jsonResponse({ alerts: [makeAlert()], nextCursor: null }),
    })
    renderApp('/')
    const card = within(await screen.findByRole('alert', { name: '현재 상태' }))
    expect(card.getByText('확인 필요')).toBeInTheDocument()
    expect(card.getByText('즉시 확인 권장')).toBeInTheDocument()
    expect(card.getByText('현관 근처에서 움직임이 감지되었습니다')).toBeInTheDocument()
    expect(card.getByRole('link', { name: '알림 자세히 보기' })).toHaveAttribute(
      'href',
      '/notifications/a1',
    )
    expect(card.getByRole('link', { name: '진행 중인 알림 1건 보기' })).toHaveAttribute(
      'href',
      '/notifications',
    )
  })

  it('센서 하나의 연결이 끊기면 "주의"이고, 모두 끊기면 "연결 끊김"이다', async () => {
    stubApi(withSensors([makeSensor({ id: 'a' }), makeSensor({ id: 'b', state: 'OFFLINE' })]))
    const first = renderApp('/')
    expect(within(await screen.findByLabelText('현재 상태')).getByText('주의')).toBeInTheDocument()
    first.unmount()

    stubApi(withSensors([makeSensor({ id: 'a', state: 'OFFLINE' })]))
    renderApp('/')
    expect(
      within(await screen.findByRole('alert', { name: '현재 상태' })).getByText('연결 끊김'),
    ).toBeInTheDocument()
  })
})

describe('대시보드: Loading · Empty · Error · Offline', () => {
  it('Loading: 불러오는 동안 안내 글자를 보여 준다', async () => {
    stubApi({ ...withSensors(), 'GET /api/events': () => new Promise<Response>(() => undefined) })
    renderApp('/')
    expect(await screen.findByText('대시보드를 불러오는 중')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument()
    expect(screen.queryByLabelText('현재 상태')).not.toBeInTheDocument()
  })

  it('Empty: 센서가 없으면 오류가 아니라 시작 전 상태로 알리고 등록·초기 설정으로 이어 준다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    expect(await screen.findByText('아직 등록된 센서가 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '센서 등록' })).toHaveAttribute('href', '/sensors/new')
    expect(screen.getByRole('link', { name: '초기 설정 하기' })).toHaveAttribute(
      'href',
      '/onboarding',
    )
    expect(screen.getByText('모니터링 시작 전')).toBeInTheDocument()
    expect(screen.queryByLabelText('현재 상태')).not.toBeInTheDocument() // "정상"처럼 보이는 카드 없음
    expect(screen.queryByRole('heading', { name: '최근 7일 움직임' })).not.toBeInTheDocument()
  })

  it('Error: 처음부터 불러오지 못하면 원인을 알리고 다시 시도하면 불러온다', async () => {
    let failing = true
    stubApi({
      ...withSensors(),
      'GET /api/sensors': () =>
        failing
          ? errorResponse(500, 'INTERNAL_ERROR', '센서 정보를 읽는 중 문제가 생겼습니다.')
          : jsonResponse({ sensors: THREE_SENSORS }),
    })
    renderApp('/')
    const alert = within(await screen.findByRole('alert'))
    expect(alert.getByText('대시보드를 불러오지 못했습니다')).toBeInTheDocument()
    expect(alert.getByText('센서 정보를 읽는 중 문제가 생겼습니다.')).toBeInTheDocument()
    expect(screen.queryByText('정상')).not.toBeInTheDocument()

    failing = false
    await userEvent.click(alert.getByRole('button', { name: '다시 시도' }))
    expect(await loaded()).toBeInTheDocument()
  })

  it('Error: 갱신에 실패해도 받아 둔 정보를 "지금 상태"로 보여 주지 않는다', async () => {
    fakeSocketStatus.set('connected')
    let failing = false
    stubApi({
      ...withSensors(),
      'GET /api/events': () =>
        failing
          ? errorResponse(500, 'INTERNAL_ERROR', '서버 오류')
          : jsonResponse({ events: [], nextCursor: null }),
    })
    renderApp('/')
    expect(within(await screen.findByLabelText('현재 상태')).getByText('주의')).toBeInTheDocument()

    failing = true
    act(() => fakeSocket.emit('event.created'))

    const card = within(await screen.findByLabelText('현재 상태'))
    expect(await card.findByText('상태 확인 불가')).toBeInTheDocument()
    expect(card.getByText(/마지막으로 확인한 상태: 주의/)).toBeInTheDocument()
    expect(await screen.findByText('최신 정보를 불러오지 못했습니다')).toBeInTheDocument()
  })

  it('Offline: 연결이 끊기면 상태 카드가 "연결 끊김"이 되고 받아 둔 정보는 마지막 확인 기준이라고 밝힌다', async () => {
    fakeSocketStatus.set('connected')
    stubApi(withSensors([makeSensor({ id: 'a' })]))
    renderApp('/')
    expect(within(await screen.findByLabelText('현재 상태')).getByText('정상')).toBeInTheDocument()

    act(() => fakeSocketStatus.set('disconnected'))

    const card = within(await screen.findByRole('alert', { name: '현재 상태' }))
    expect(card.getByText('연결 끊김')).toBeInTheDocument()
    expect(card.queryByText('정상')).not.toBeInTheDocument()
    expect(card.getByText(/마지막으로 확인한 상태: 정상/)).toBeInTheDocument()
    expect(card.queryByRole('link', { name: /진행 중인 알림/ })).not.toBeInTheDocument()
    expect(screen.getAllByText(/연결이 끊기기 전에 받은/).length).toBeGreaterThan(0)
    expect(screen.getByText('모니터링 켜짐 (마지막 확인 기준)')).toBeInTheDocument()

    // 연결이 돌아오면 다시 현재 상태가 된다
    act(() => fakeSocketStatus.set('connected'))
    await waitFor(() => expect(screen.getByLabelText('현재 상태')).toHaveTextContent('정상'))
    expect(screen.queryByText(/연결이 끊기기 전에 받은/)).not.toBeInTheDocument()
  })

  it('Offline: 연결이 끊겨 있고 받은 정보도 없으면 "기록 없음"이 아니라 연결 문제라고 알린다', async () => {
    fakeSocketStatus.set('disconnected')
    stubApi({ ...withSensors(), 'GET /api/events': () => new Promise<Response>(() => undefined) })
    renderApp('/')
    expect(await screen.findByText('연결이 끊겨 대시보드를 볼 수 없습니다')).toBeInTheDocument()
    expect(screen.queryByText('아직 등록된 센서가 없습니다')).not.toBeInTheDocument()
    expect(screen.queryByText('최근 감지된 움직임이 없습니다')).not.toBeInTheDocument()
  })
})

describe('대시보드: Mock 어댑터', () => {
  it('샘플 데이터로 그려지고, 모든 값이 샘플임을 알아볼 수 있다', async () => {
    const real = createHttpApiClient()
    const runtime = testRuntime({
      client: composeApiClient(real, createMockApiClient(), ['dashboard']),
      mockFeatures: ['dashboard'],
    })
    stubApi(loggedInHandlers()) // 대시보드 데이터는 서버에서 가져오지 않는다
    renderApp('/', runtime)
    expect(await screen.findByText('개발용 샘플 데이터입니다')).toBeInTheDocument()
    expect(screen.getAllByText(/\(샘플\)/).length).toBeGreaterThan(0)
    expect(screen.getByText('일부 화면이 샘플 데이터입니다')).toBeInTheDocument()
    // 연결 정상 + 배터리 부족(이동 경로 샘플)
    expect(screen.getByText(/배터리 부족/)).toBeInTheDocument()
  })
})
