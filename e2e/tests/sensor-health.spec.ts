import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { clearSimulated, ensureSimulatedSensors, resetState } from '../support/api'

/**
 * 센서 상태 모니터링의 일관성: 시뮬레이터에서 연결 해제·배터리 부족·복구를 실행하면
 * 서버(API)와 센서 관리·대시보드 화면이 같은 상태를 보여 준다.
 */
test.beforeEach(async ({ request }) => {
  await resetState(request)
  await clearSimulated(request)
  await ensureSimulatedSensors(request)
})

const zoneCard = (page: Page, zone: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: zone })
    .filter({ has: page.getByRole('button', { name: '움직임 보내기' }) })

const apiSensor = async (request: APIRequestContext, zone: string) => {
  const body = (await (await request.get('/api/sensors')).json()) as {
    sensors: {
      zone: string
      state: string
      batteryLevel: string
      batteryPercent: number | null
      origin: string
    }[]
  }
  return body.sensors.find((s) => s.zone === zone && s.origin === 'SIMULATED')!
}

test('연결 해제 → 배터리 부족 → 복구가 서버와 두 화면에서 같은 상태로 보인다', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  test.setTimeout(120_000)

  // 센서 관리 화면을 따로 열어 둔다. (실시간으로 바뀌는지 보려는 것)
  const sensors = await page.context().newPage()
  await sensors.goto('/sensors')
  await expect(sensors.getByRole('heading', { name: '센서 관리', exact: true })).toBeVisible()
  const bedCard = sensors
    .getByRole('heading', { name: '시뮬레이션 침대 주변' })
    .locator('xpath=ancestor::li[1]')
  await expect(bedCard.getByText('연결됨')).toBeVisible({ timeout: 15_000 })

  await page.goto('/dev/simulator')
  await page.getByRole('button', { name: '침대 주변 끊김 바로 확인' }).click()

  // 서버: OFFLINE · 센서 관리 화면: 새로고침 없이 "연결 끊김"
  await expect.poll(async () => (await apiSensor(request, 'BED_SIDE')).state).toBe('OFFLINE')
  await expect(bedCard.getByText('연결 끊김')).toBeVisible({ timeout: 15_000 })
  await expect(sensors.getByText(/연결이 끊긴 센서 1개/)).toBeVisible()

  // 대시보드도 같은 센서를 끊김으로 보여 준다.
  await page.goto('/')
  const dashboardCard = page
    .getByRole('link', { name: '시뮬레이션 침대 주변' })
    .locator('xpath=ancestor::li[1]')
  await expect(dashboardCard.getByText('연결 끊김')).toBeVisible({ timeout: 15_000 })

  // 복구: 신호가 다시 오면 서버·화면 모두 ONLINE
  await page.goto('/dev/simulator')
  await zoneCard(page, '침대 주변').getByRole('button', { name: '연결 복구' }).click()
  await expect.poll(async () => (await apiSensor(request, 'BED_SIDE')).state).toBe('ONLINE')
  await expect(bedCard.getByText('연결됨')).toBeVisible({ timeout: 15_000 })

  // 배터리 부족: 서버가 LOW 로 판단하고, 화면에 잔량과 "부족"이 보인다.
  await zoneCard(page, '침대 주변').getByRole('button', { name: '배터리 18%' }).click()
  await expect.poll(async () => (await apiSensor(request, 'BED_SIDE')).batteryLevel).toBe('LOW')
  expect((await apiSensor(request, 'BED_SIDE')).batteryPercent).toBe(18)
  await expect(bedCard.getByText(/배터리 부족/).first()).toBeVisible({ timeout: 15_000 })
  const alerts = (await (await request.get('/api/alerts?type=LOW_BATTERY')).json()) as {
    alerts: unknown[]
  }
  expect(alerts.alerts).toHaveLength(1)

  // 같은 수준을 다시 보고해도 알림은 늘지 않는다.
  await zoneCard(page, '침대 주변').getByRole('button', { name: '배터리 18%' }).click()
  await page.waitForTimeout(500)
  const again = (await (await request.get('/api/alerts?type=LOW_BATTERY')).json()) as {
    alerts: unknown[]
  }
  expect(again.alerts).toHaveLength(1)
})

test('잘못된 신호는 서버가 거부하고 센서의 데이터 수신 오류로 보인다', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  await page.goto('/dev/simulator')
  await page.getByLabel('전송 방식').selectOption('invalid')
  await zoneCard(page, '이동 경로').getByRole('button', { name: '움직임 보내기' }).click()
  await expect(page.getByText('거부됨')).toBeVisible()

  const body = (await (await request.get('/api/sensors')).json()) as {
    sensors: { zone: string; receiveErrors: { count: number; lastReason: string | null } }[]
  }
  expect(body.sensors.find((s) => s.zone === 'PATH')?.receiveErrors).toMatchObject({
    count: 1,
    lastReason: 'TOO_OLD',
  })

  await page.goto('/sensors')
  const card = page
    .getByRole('heading', { name: '시뮬레이션 이동 경로' })
    .locator('xpath=ancestor::li[1]')
  await expect(card.getByText(/데이터 수신 오류 1건/)).toBeVisible()
})
