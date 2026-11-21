import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'
import { listScreenRoutes } from '../support/routes'

/**
 * 태블릿(768px)·모바일(412px) 화면: 레이아웃이 깨지지 않고, 터치하기 쉬운 크기이며, 핵심 흐름이 끝까지 된다.
 * (계획서 12절 ⑥ 모바일 뷰포트)
 */

/** 가로로 넘치는 폭(px). 0 이어야 한다. */
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** 높이 44px 미만인 눈에 보이는 조작 요소. 스크린리더 전용·체크/라디오 입력은 제외한다. */
const smallTargets = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('a, button, select, textarea, input')]
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        const type = el instanceof HTMLInputElement ? el.type : ''
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.height < 44 &&
          !el.closest('.sr-only') &&
          !['radio', 'checkbox'].includes(type) &&
          getComputedStyle(el).position !== 'absolute'
        )
      })
      .map(
        (el) =>
          `${el.tagName}:${(el.textContent ?? el.getAttribute('name') ?? '').trim().slice(0, 20)}:${Math.round(el.getBoundingClientRect().height)}`,
      ),
  )

test.describe('레이아웃', () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request)
    await ensureSimulatedSensors(request)
    await playScenario(request, 'entrance')
  })

  test('폭에 맞는 내비게이션을 보여 준다 (모바일: 하단 탭, 태블릿 이상: 사이드바)', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    const bottom = page.getByRole('navigation', { name: '하단 메뉴' })
    const side = page.getByRole('navigation', { name: '주요 메뉴' })
    if (testInfo.project.name === 'mobile') {
      await expect(bottom).toBeVisible()
      await expect(side).toBeHidden()
      await expect(bottom.getByRole('link')).toHaveCount(5)
    } else {
      await expect(side).toBeVisible()
      await expect(bottom).toBeHidden()
    }
  })

  test('모든 화면이 가로로 넘치지 않고 터치 영역이 44px 이상이다', async ({ page, request }) => {
    test.setTimeout(180_000)
    const routes = await listScreenRoutes(request)
    for (const route of routes) {
      await page.goto(route.path)
      await expect(
        page.getByRole('heading', { name: route.heading, exact: true }).first(),
      ).toBeVisible()
      await expect(page.getByText('불러오는 중', { exact: false })).toHaveCount(0)
      expect(await horizontalOverflow(page), `${route.name}: 가로로 넘칩니다`).toBe(0)
      expect(await smallTargets(page), `${route.name}: 터치 영역이 작은 요소`).toEqual([])
    }
  })

  test('로그인 화면과 서비스 안내도 넘치지 않는다', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      ...testInfo.project.use,
      storageState: { cookies: [], origins: [] },
    })
    const page = await context.newPage()
    for (const [path, heading] of [
      ['/login', '로그인'],
      ['/notice', '서비스 안내와 한계'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      expect(await horizontalOverflow(page), `${path}: 가로로 넘칩니다`).toBe(0)
      expect(await smallTargets(page), `${path}: 터치 영역이 작은 요소`).toEqual([])
    }
    await context.close()
  })
})

test('⑥ 작은 화면에서도 알림을 받고 확인하는 흐름이 끝까지 된다', async ({ page, request }) => {
  await resetState(request)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')

  // 도착 배너 → 알림 상세 → 확인
  const banner = page.getByLabel('새 알림')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('즉시 확인 권장')
  await banner.getByRole('link', { name: '알림 보기' }).tap()
  await expect(page.getByRole('heading', { name: '알림 상세' })).toBeVisible()
  await page.getByRole('button', { name: '확인했습니다' }).tap()
  await expect(page.getByText('확인함').first()).toBeVisible()
  expect(await horizontalOverflow(page)).toBe(0)

  // 하단/사이드 메뉴로 다른 화면에 갈 수 있다
  await page
    .getByRole('link', { name: /^센서( 관리)?$/ })
    .first()
    .tap()
  await expect(page.getByRole('heading', { name: '센서 관리', exact: true })).toBeVisible()
  await expect(page.getByText('시뮬레이션 침대 주변')).toBeVisible()
})
