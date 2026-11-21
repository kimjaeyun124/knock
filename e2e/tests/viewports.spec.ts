import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'
import { listScreenRoutes } from '../support/routes'

/**
 * 요구된 다섯 가지 화면 폭(375·390·768·1024·1440px)에서 모든 화면이
 * 가로로 넘치지 않고, 터치 영역이 44px 이상이며, 모든 기능으로 갈 수 있는 내비게이션이 있는지 확인한다.
 * (responsive.spec.ts 는 기기 에뮬레이션 두 가지(태블릿·모바일)로 같은 검사를 한다.)
 */
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

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

test.beforeEach(async ({ request }) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')
})

for (const viewport of WIDTHS) {
  test(`${viewport.width}px: 모든 화면이 넘치지 않고 터치 영역이 충분하며 메뉴로 모든 기능에 갈 수 있다`, async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '화면 폭은 이 테스트가 직접 바꾼다.')
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)

    for (const route of await listScreenRoutes(request)) {
      await page.goto(route.path)
      await expect(
        page.getByRole('heading', { name: route.heading, exact: true }).first(),
      ).toBeVisible()
      await expect(page.getByText('불러오는 중', { exact: false })).toHaveCount(0)
      expect(await horizontalOverflow(page), `${route.name}: 가로로 넘칩니다`).toBe(0)
      expect(await smallTargets(page), `${route.name}: 터치 영역이 작은 요소`).toEqual([])
    }

    // 어느 폭에서든 주요 메뉴(사이드바 또는 하단 탭)가 하나는 보이고, 거기서 모든 주요 화면으로 갈 수 있다.
    await page.goto('/')
    const side = page.getByRole('navigation', { name: '주요 메뉴' })
    const bottom = page.getByRole('navigation', { name: '하단 메뉴' })
    const nav = (await side.isVisible()) ? side : bottom
    await expect(nav).toBeVisible()
    for (const name of ['대시보드|홈', '알림', '센서', '기록', '설정']) {
      await expect(
        nav.getByRole('link', { name: new RegExp(name) }).first(),
        `${viewport.width}px 메뉴: ${name}`,
      ).toBeVisible()
    }
  })
}
