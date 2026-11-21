import { expect, test, type APIRequestContext } from '@playwright/test'
import { clearSimulated, ensureSimulatedSensors, resetState, sendMotion } from '../support/api'

/**
 * 발표 시연 시나리오 (docs/DEMO_GUIDE.md). 화면 조작이 아니라 실제 서버 처리 경로
 * (시뮬레이터 → 수집 API → DB → 감지 규칙 → 알림 → 실시간 화면)를 거친 결과를 확인한다.
 */
test.beforeEach(async ({ request }) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
})

const alertsOf = async (request: APIRequestContext) =>
  (
    (await (await request.get('/api/alerts?limit=50')).json()) as {
      alerts: { type: string; origin: string; status: string }[]
    }
  ).alerts
const eventsOf = async (request: APIRequestContext) =>
  (
    (await (await request.get('/api/events?limit=50')).json()) as {
      events: { zone: string; origin: string }[]
    }
  ).events

test('시연 표시: 시뮬레이션 데이터가 있으면 모든 화면에서 실제 상황이 아님을 알리고, 지우면 사라진다', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByText(/시연용 시뮬레이션 데이터가 있습니다/)).toBeVisible()
  await expect(page.getByText(/실제 센서나 실제 상황이 아닙니다/)).toBeVisible()

  await clearSimulated(request)
  await page.reload()
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  await expect(page.getByText(/시연용 시뮬레이션 데이터가 있습니다/)).toHaveCount(0)
})

test('시나리오 5 — 불필요한 알림 방지: 같은 구역의 반복 신호는 기록은 모두 남기고 알림은 한 번만 만든다', async ({
  page,
  request,
}) => {
  for (let i = 0; i < 4; i += 1) await sendMotion(request, 'ENTRANCE')

  // 서버 기록: 움직임 4건, 현관 알림은 1건 (반복 억제 시간 안)
  await expect
    .poll(async () => (await eventsOf(request)).filter((e) => e.zone === 'ENTRANCE').length)
    .toBe(4)
  const entranceAlerts = (await alertsOf(request)).filter((a) => a.type === 'ENTRANCE_APPROACH')
  expect(entranceAlerts).toHaveLength(1)
  expect(entranceAlerts[0]?.origin).toBe('SIMULATED')

  // 화면도 같은 결과: 알림 센터에는 1건, 움직임 기록에는 4건
  await page.goto('/notifications')
  await expect(page.getByText('현관 근처에서 움직임이 감지되었습니다').first()).toBeVisible()
  await expect(page.getByText('현관 근처에서 움직임이 감지되었습니다')).toHaveCount(1)
  await page.goto('/events')
  await expect(page.getByText('시뮬레이션').first()).toBeVisible()
})

test('데모 초기화: 시뮬레이션 데이터만 지우고 센서를 다시 연결하면 처음 상태로 되돌아가 시나리오를 반복할 수 있다', async ({
  request,
}) => {
  await sendMotion(request, 'ENTRANCE')
  await expect.poll(async () => (await alertsOf(request)).length).toBeGreaterThan(0)

  await resetState(request)
  expect(await alertsOf(request)).toHaveLength(0)
  expect(await eventsOf(request)).toHaveLength(0)

  await ensureSimulatedSensors(request)
  await sendMotion(request, 'ENTRANCE')
  await expect
    .poll(
      async () => (await alertsOf(request)).filter((a) => a.type === 'ENTRANCE_APPROACH').length,
    )
    .toBe(1)
})
