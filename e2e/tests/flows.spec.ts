import { expect, test, type Page } from '@playwright/test'
import {
  clearSimulated,
  ensureSimulatedSensors,
  playScenario,
  resetState,
  sendMotion,
  setSettings,
} from '../support/api'

/**
 * 계획서 12절의 E2E 시나리오. 서버는 실제(임시 SQLite), 신호는 시뮬레이터가 실제 수집 API 로 보낸다.
 * 화면은 새로고침 없이 실시간으로 바뀌어야 하므로, 페이지를 새로 열지 않았다는 표식을 심어 확인한다.
 */

async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => Object.assign(window, { __e2eNoReload: true }))
}
async function expectNotReloaded(page: Page): Promise<void> {
  expect(await page.evaluate(() => '__e2eNoReload' in window)).toBe(true)
}
const overallStatus = (page: Page) => page.getByLabel('현재 상태')
const strip = (page: Page) => page.getByLabel('시스템 상태')

test.beforeEach(async ({ request }) => {
  await resetState(request)
})

test('① 시뮬레이터 신호가 새로고침 없이 대시보드에 실시간으로 나타난다', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  await expect(strip(page)).toContainText('실시간 연결됨')
  await expect(strip(page)).toContainText('사용 중인 센서 없음')
  await markPage(page)

  await ensureSimulatedSensors(request)
  await expect(strip(page)).toContainText('센서 3개 모두 연결됨')
  await expect(strip(page)).toContainText('시뮬레이션 센서 3개 사용 중')
  await expect(overallStatus(page)).toContainText('정상')

  await sendMotion(request, 'PATH')
  // 센서 요약의 이동 경로 구역과 "최근 움직임" 목록에 바로 나타난다
  const pathZone = page.locator('li', { has: page.getByText('이동 경로', { exact: true }) }).first()
  await expect(pathZone).toContainText('마지막 신호 방금 전')
  await expect(
    page
      .getByRole('heading', { name: '최근 움직임', exact: true })
      .locator('xpath=ancestor::section[1]'),
  ).toContainText('이동 경로 · 움직임 감지')
  await expectNotReloaded(page)
})

test('② 현관 시나리오 → 긴급 알림 배너 → 확인 → 종료까지 처리할 수 있다', async ({ page }) => {
  await page.goto('/dev/simulator')
  await expect(page.getByText('시뮬레이션입니다. 실제 센서가 아닙니다')).toBeVisible()
  await page.getByRole('button', { name: '현관 근처 움직임 재생' }).click()

  // 도착 배너: 어느 화면에 있든 맨 위에 뜬다
  const banner = page.getByLabel('새 알림')
  await expect(banner).toContainText('현관 근처에서 움직임이 감지되었습니다')
  await banner.getByRole('link', { name: '알림 보기' }).click()

  await expect(page.getByRole('heading', { name: '알림 상세' })).toBeVisible()
  await expect(page.getByText('즉시 확인 권장').first()).toBeVisible()
  await expect(page.getByText('시뮬레이션', { exact: true }).first()).toBeVisible()
  // 앱 화면 알림은 화면이 열려 있었으므로 "전송 성공"(열려 있는 화면에 보냄). 시뮬레이션 알림은 푸시·문자 같은 앱 밖 채널로는 보내지 않는다.
  await expect(page.getByText('전송 성공', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('연동되지 않음')).toHaveCount(0)
  await expect(page.getByText(/앱 화면 알림은 이 화면이 열려 있을 때만 전달됩니다/)).toBeVisible()

  await page.getByRole('button', { name: '확인했습니다' }).click()
  await expect(page.getByText('확인함').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '확인했습니다' })).toHaveCount(0)

  await page.getByRole('radio', { name: '잘못된 알림' }).check()
  await page.getByLabel('메모 (선택)').fill('시험용 신호')
  await page.getByRole('button', { name: '알림 종료' }).click()
  await expect(page.getByText('종료 (잘못된 알림)')).toBeVisible()
  await expect(page.getByText('시험용 신호')).toBeVisible()

  // 종료한 알림은 홈의 큰 상태에서 빠진다
  await page.goto('/')
  await expect(overallStatus(page)).toContainText('정상')
})

test('③ 센서 연결이 끊기면 "주의"로 알리고, 복구하면 되돌아온다', async ({ page, request }) => {
  test.slow()
  test.setTimeout(240_000)
  // 신호가 없으면 연결 끊김으로 보는 시간을 최소(60초)로 줄여 기다리는 시간을 줄인다.
  await setSettings(request, { offlineAfterSeconds: 60 })
  await ensureSimulatedSensors(request)

  await page.goto('/dev/simulator')
  await page.getByRole('button', { name: '연결 끊기' }).first().click()
  await expect(page.getByText('신호를 보내지 않는 중')).toBeVisible()

  await page.goto('/')
  await expect(overallStatus(page)).toContainText('정상')
  // 서버의 주기 점검이 끊김을 찾을 때까지 실제 시간을 기다린다.
  await expect(strip(page)).toContainText('연결 끊긴 센서 1개', { timeout: 150_000 })
  await expect(overallStatus(page)).toContainText('주의')
  await expect(overallStatus(page)).toContainText('센서 1개의 연결이 끊겨 있습니다.')
  await expect(overallStatus(page)).not.toContainText('정상')

  await page.goto('/dev/simulator')
  await page.getByRole('button', { name: '연결 복구' }).click()
  await page.goto('/')
  await expect(strip(page)).toContainText('센서 3개 모두 연결됨')
  await expect(overallStatus(page)).toContainText('정상')
})

test('④ 전달 실패를 주입하면 배너가 뜨지 않고, 재시도가 끝나면 경고가 화면에 나타난다', async ({
  page,
}) => {
  test.slow()
  test.setTimeout(360_000)
  await page.goto('/dev/simulator')
  await page.getByRole('button', { name: '전달 실패 주입 켜기' }).click()
  await expect(page.getByText(/주입 중 · .*자동으로 꺼짐/)).toBeVisible()
  await page.getByRole('button', { name: '현관 근처 움직임 재생' }).click()

  await page.goto('/')
  await expect(overallStatus(page)).toContainText('현관 근처에서 움직임이 감지되었습니다')
  await expect(overallStatus(page)).toContainText('시뮬레이션으로 만들어진 알림입니다')
  // 화면이 열려 있는데도 주입 때문에 전달되지 않아 배너가 없다
  await expect(page.getByLabel('새 알림')).toHaveCount(0)

  await overallStatus(page).getByRole('link', { name: '알림 자세히 보기' }).click()
  await expect(page.getByText(/시뮬레이션: 전달 실패를 주입했습니다/)).toBeVisible()
  await expect(page.getByText('전송 성공', { exact: true })).toHaveCount(0)

  // 재시도(30초, 2분 뒤)가 모두 실패하면 "전달 실패" 경고가 상단과 홈에 나타난다
  await page.goto('/')
  await expect(strip(page)).toContainText('알림 전달 실패 1건', { timeout: 300_000 })
  await expect(overallStatus(page)).toContainText(
    '보호자에게 알림을 전달하지 못한 기록이 있습니다.',
  )
})

test('⑤ 민감도를 바꾸면 같은 시나리오에서 알림이 달라진다', async ({ page, request }) => {
  await page.goto('/settings/detection')
  await page.getByRole('radio', { name: /낮음/ }).check()
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(/저장했습니다/)).toBeVisible()

  // 낮음: 침대 → 이동 경로 흐름만으로는 알리지 않는다
  await playScenario(request, 'normal-night')
  await page.goto('/notifications')
  await expect(page.getByText('알림이 없습니다', { exact: true })).toBeVisible()

  // 보통: 같은 신호에서 "확인 필요" 알림이 생긴다
  await clearSimulated(request)
  await page.goto('/settings/detection')
  await page.getByRole('radio', { name: /보통/ }).check()
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(/저장했습니다/)).toBeVisible()
  await playScenario(request, 'normal-night')
  await page.goto('/notifications')
  await expect(
    page.getByRole('link', {
      name: '침대 주변에서 이동 경로로 움직임이 이어졌습니다',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText('확인 필요').first()).toBeVisible()
})
