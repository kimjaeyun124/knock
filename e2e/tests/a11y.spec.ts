import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'
import { listScreenRoutes } from '../support/routes'

/**
 * 자동 접근성 점검(axe): WCAG 2.0/2.1 A·AA 규칙(색 대비, 이름 없는 버튼·링크, 폼 라벨, 랜드마크, 제목 순서 등).
 * 데스크톱·태블릿·모바일에서 모두 돌린다. 자동 점검이 잡지 못하는 것(읽는 순서, 문구의 이해 용이성 등)은 사람이 봐야 한다.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact ?? '?'}): ${v.help}\n` +
      v.nodes
        .slice(0, 3)
        .map((n) => `    ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`)
        .join('\n'),
  )
  expect(violations, `${label}\n${summary.join('\n')}`).toEqual([])
}

test.describe('로그인한 화면', () => {
  test('모든 화면에 접근성 위반이 없다', async ({ page, request }) => {
    test.setTimeout(180_000)
    await resetState(request)
    await ensureSimulatedSensors(request)
    await playScenario(request, 'entrance')
    const routes = await listScreenRoutes(request)

    for (const route of routes) {
      await page.goto(route.path)
      await expect(
        page.getByRole('heading', { name: route.heading, exact: true }).first(),
      ).toBeVisible()
      // 목록·상태가 다 그려질 때까지 기다린다 (불러오는 중 표시가 사라질 때까지)
      await expect(page.getByText('불러오는 중', { exact: false })).toHaveCount(0)
      await expectNoViolations(page, `${route.name} (${route.path})`)
    }
  })

  test('알림 배너가 떠 있는 상태에서도 위반이 없다', async ({ page, request }) => {
    await resetState(request)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    await ensureSimulatedSensors(request)
    await playScenario(request, 'entrance')
    await expect(page.getByLabel('새 알림')).toBeVisible()
    await expectNoViolations(page, '긴급 알림 배너')
  })

  test('연결 끊김·확인 불가 같은 경고 상태에서도 위반이 없다', async ({ page, request }) => {
    await resetState(request)
    await ensureSimulatedSensors(request)
    await request.post('/api/dev/simulator/battery', { data: { zone: 'PATH', batteryPercent: 9 } })
    await page.goto('/')
    await expect(page.getByLabel('현재 상태')).toContainText('주의')
    await expectNoViolations(page, '대시보드: 주의 상태')
  })
})

test.describe('로그인하지 않은 화면', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const [name, path, heading] of [
    ['로그인', '/login', '로그인'],
    ['첫 계정 만들기', '/register', '첫 계정 만들기'],
    ['서비스 안내와 한계', '/notice', '서비스 안내와 한계'],
  ] as const) {
    test(`${name} 화면에 접근성 위반이 없다`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      await expectNoViolations(page, `${name} (${path})`)
    })
  }
})
