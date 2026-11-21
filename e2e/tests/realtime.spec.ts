import { expect, test } from '@playwright/test'
import { ensureSimulatedSensors, resetState, sendMotion } from '../support/api'

/**
 * 실시간 전달의 복구: 화면의 연결이 끊긴 동안 서버에 쌓인 신호·알림이,
 * 연결이 돌아오면 새로고침 없이 화면에 나타난다. (소켓 메시지는 쌓이지 않고, DB 에서 REST 로 다시 읽는다)
 */
test.beforeEach(async ({ request }) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
})

test('연결이 끊겼다 돌아오면 끊긴 동안의 알림이 새로고침 없이 나타난다', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  test.setTimeout(90_000)

  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: '알림 센터', exact: true })).toBeVisible()
  await expect(page.getByText('연결 정상').first()).toBeVisible({ timeout: 15_000 })

  // 화면의 인터넷이 끊긴다. (서버는 계속 동작하고, 테스트의 API 요청은 별개의 연결이라 계속 보낼 수 있다)
  await page.context().setOffline(true)
  await expect(page.getByRole('region', { name: '연결 안내' })).toBeVisible({ timeout: 15_000 })

  // 끊긴 동안 서버에 신호가 오고 알림이 만들어진다.
  await sendMotion(request, 'ENTRANCE')
  const alerts = (await (await request.get('/api/alerts')).json()) as { alerts: { type: string }[] }
  expect(alerts.alerts.map((a) => a.type)).toContain('ENTRANCE_APPROACH')
  // 화면은 아직 모른다 — 끊긴 화면에 새 알림을 현재 상태처럼 보여 주지 않는다.
  await expect(page.getByText('현관 근처에서 움직임이 감지되었습니다')).toHaveCount(0)

  // 연결이 돌아오면 안내가 사라지고, 새로고침 없이 끊긴 동안의 알림이 보인다.
  await page.context().setOffline(false)
  await expect(page.getByRole('region', { name: '연결 안내' })).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText(/현관 근처에서 움직임이 감지되었습니다/).first()).toBeVisible({
    timeout: 30_000,
  })
})

test('설정의 연결 상태에 실시간 연결·재연결 기록이 보인다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  await page.goto('/settings')
  const panel = page
    .getByRole('heading', { name: '시스템 연결 상태' })
    .locator('xpath=ancestor::section[1]')
  await expect(panel.getByText('실시간 연결', { exact: true })).toBeVisible()
  await expect(panel.getByText(/다시 연결에 성공한 횟수/)).toBeVisible()
  await expect(panel.getByText('실시간 연결을 마지막으로 시작한 시각')).toBeVisible()
  await expect(panel.getByText('연결됨', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
})
