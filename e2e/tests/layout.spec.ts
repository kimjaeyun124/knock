import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'

/**
 * 공통 레이아웃(AppShell)을 실제 브라우저에서 확인한다.
 * 데스크톱·태블릿은 고정 사이드바, 모바일은 하단 메뉴를 쓴다. (같은 파일이 세 화면 크기에서 돈다)
 */

const MENUS = [
  { path: '/', heading: '대시보드', side: '대시보드', bottom: '홈' },
  { path: '/sensors', heading: '센서 관리', side: '센서 관리', bottom: '센서' },
  { path: '/events', heading: '움직임 기록', side: '움직임 기록', bottom: '기록' },
  { path: '/notifications', heading: '알림 센터', side: '알림 센터', bottom: '알림' },
  { path: '/settings', heading: '설정', side: '설정', bottom: '설정' },
] as const

const isMobile = (testInfo: { project: { name: string } }) => testInfo.project.name === 'mobile'

/** 지금 폭에서 쓰는 주요 메뉴 영역 */
const menuOf = (page: Page, mobile: boolean) =>
  page.getByRole('navigation', { name: mobile ? '하단 메뉴' : '주요 메뉴' })

test.beforeEach(async ({ request }) => {
  await resetState(request)
})

test('메뉴를 눌러 이동하면 현재 위치가 표시되고, 새로고침해도 같은 화면이 열린다', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()

  for (const menu of MENUS) {
    const label = mobile ? menu.bottom : menu.side
    await menuOf(page, mobile).getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${menu.path === '/' ? '/$' : `${menu.path}$`}`))
    await expect(page.getByRole('heading', { name: menu.heading, exact: true })).toBeVisible()
    // 현재 위치는 aria-current 로 하나만 표시된다
    await expect(menuOf(page, mobile).locator('[aria-current="page"]')).toHaveCount(1)
    await expect(menuOf(page, mobile).locator('a[aria-current="page"]')).toHaveText(label)
    // 탭 제목도 현재 화면을 따라간다
    await expect(page).toHaveTitle(`${menu.heading} · 노크`)

    // 새로고침해도 경로와 화면이 그대로다 (로그인도 유지된다)
    await page.reload()
    await expect(page).toHaveURL(new RegExp(`${menu.path === '/' ? '/$' : `${menu.path}$`}`))
    await expect(page.getByRole('heading', { name: menu.heading, exact: true })).toBeVisible()
  }
})

test('하위 화면에서도 상위 메뉴가 현재 위치이고, 이동 경로는 두 단계 이상일 때만 보인다', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo)
  const crumbs = page.getByRole('navigation', { name: '현재 위치' })

  await page.goto('/sensors')
  await expect(page.getByRole('heading', { name: '센서 관리', exact: true })).toBeVisible()
  await expect(crumbs).toHaveCount(0)

  await page.goto('/settings/detection')
  await expect(page.getByRole('heading', { name: '감지 시간·민감도' })).toBeVisible()
  await expect(crumbs.getByRole('link', { name: '설정' })).toBeVisible()
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('감지 시간·민감도')
  await expect(menuOf(page, mobile).locator('a[aria-current="page"]')).toHaveText('설정')

  // 이동 경로의 상위 링크로 돌아간다
  await crumbs.getByRole('link', { name: '설정' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(crumbs).toHaveCount(0)
})

test('초기 설정과 예전 주소(/alerts, /history, /setup)가 열리고 새 주소로 정리된다', async ({
  page,
}) => {
  await page.goto('/onboarding')
  await expect(page.getByRole('heading', { name: '초기 설정', exact: true })).toBeVisible()

  for (const [from, to, heading] of [
    ['/alerts', '/notifications', '알림 센터'],
    ['/history', '/events', '움직임 기록'],
    ['/setup', '/onboarding', '초기 설정'],
  ] as const) {
    await page.goto(from)
    await expect(page).toHaveURL(new RegExp(`${to}$`))
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('스크롤해도 데스크톱·태블릿은 사이드바가, 모바일은 하단 메뉴가 제자리에 있다', async ({
  page,
}, testInfo) => {
  const mobile = isMobile(testInfo)
  await page.goto('/dev/design') // 긴 화면
  await expect(page.getByRole('heading', { level: 1, name: '디자인 시스템' })).toBeVisible()
  const menu = menuOf(page, mobile)
  await expect(menu).toBeVisible()
  const before = await menu.boundingBox()

  await page.evaluate(() => window.scrollTo(0, 1500))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
  const after = await menu.boundingBox()
  expect(after?.y).toBeCloseTo(before?.y ?? -1, 0)
  await expect(menu).toBeInViewport()

  // 다른 쪽 메뉴는 보이지 않는다
  await expect(menuOf(page, !mobile)).toBeHidden()
})

test('좁은 화면에서는 하단 메뉴가 본문 맨 아래를 가리지 않는다', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), '모바일 전용')
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '설정', exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const lastLink = page.getByRole('main').getByRole('link').last()
  const menuTop = (await menuOf(page, true).boundingBox())?.y ?? 0
  const linkBottom = (await lastLink.boundingBox())?.y ?? 0
  expect(linkBottom + (await lastLink.evaluate((el) => el.clientHeight))).toBeLessThanOrEqual(
    menuTop,
  )
})

test('헤더에 연결 상태·알림 센터 버튼·계정 메뉴가 있고, 안전 상태가 첫 화면에 보인다', async ({
  page,
  request,
}) => {
  await ensureSimulatedSensors(request) // 센서가 있어야 상태 카드가 나온다
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  const header = page.getByRole('banner').first()
  await expect(header.getByText('연결 정상')).toBeVisible()
  await expect(header.getByRole('link', { name: /^알림 센터/ })).toBeVisible()
  await expect(header.getByRole('button', { name: /알림 소리/ })).toBeVisible()
  await expect(header.getByRole('button', { name: '로그아웃' })).toBeVisible()
  // 전체 상태 패널(현재 상태)이 스크롤 없이 첫 화면 안에 들어온다
  await expect(page.getByLabel('현재 상태')).toBeInViewport()
})

test('인터넷이 끊기면 "연결 끊김"과 안내를 띄우고, 돌아오면 다시 "연결 정상"이 된다', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  const header = page.getByRole('banner').first()
  await expect(header.getByText('연결 정상')).toBeVisible()
  await expect(page.getByLabel('연결 안내')).toHaveCount(0)

  await context.setOffline(true)
  await expect(header.getByText('연결 끊김')).toBeVisible()
  const notice = page.getByLabel('연결 안내')
  await expect(notice).toContainText('연결이 끊겨 최신 정보를 받지 못하고 있습니다')
  await expect(notice).toContainText('까지 확인한 정보이며, 지금 상태와 다를 수 있습니다')
  await expect(header.getByText('연결 정상')).toHaveCount(0)
  // 알림 센터 버튼도 이전 건수를 현재 값처럼 보여 주지 않는다
  await expect(
    header.getByRole('link', { name: /새 알림을 확인하지 못하고 있습니다/ }),
  ).toBeVisible()

  await context.setOffline(false)
  await expect(header.getByText('연결 정상')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('연결 안내')).toHaveCount(0)
})

test('화면 모양 확인용 스크린샷 (LAYOUT_SHOT_DIR 이 있을 때만 저장한다)', async ({
  page,
  request,
  context,
}, testInfo) => {
  const dir = process.env['LAYOUT_SHOT_DIR']
  test.skip(!dir, '모양을 눈으로 볼 때만 쓴다')
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')
  const name = testInfo.project.name
  for (const [label, path] of [
    ['dashboard', '/'],
    ['sensors', '/sensors'],
    ['settings-detection', '/settings/detection'],
    ['events', '/events'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: label === 'dashboard' })
  }
  // 움직임 기록의 상세
  await page.goto('/events')
  await page.getByRole('region', { name: '이벤트 타임라인' }).getByRole('button').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/${name}-event-detail.png` })
  await page.keyboard.press('Escape')
  await page.goto('/')
  await expect(page.getByRole('banner').first().getByText('연결 정상')).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByLabel('연결 안내')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/${name}-offline.png`, fullPage: false })
  await context.setOffline(false)
})
