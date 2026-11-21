import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { clearSimulated, ensureSimulatedSensors, resetState, sendMotion } from '../support/api'

/**
 * 설정 화면: 저장한 값이 실제 이벤트 처리에 반영되는지(모니터링 사용 여부·센서별 민감도),
 * 어두운 테마·큰 글자에서 접근성 위반이 없는지를 실제 브라우저·서버로 확인한다.
 * 서버 상태를 모든 테스트가 공유하므로, 바꾼 설정은 마지막에 되돌린다.
 */

const ALL_ON = {
  bedAreaActivity: true,
  bedToPath: true,
  entranceApproach: true,
  repeatedMovement: true,
  sensorIssues: true,
  lowBattery: true,
}

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target.join(' ')})`),
    label,
  ).toEqual([])
}

const alertTypes = async (api: APIRequestContext): Promise<string[]> =>
  (
    (await (await api.get('/api/alerts?limit=100')).json()) as { alerts: { type: string }[] }
  ).alerts.map((a) => a.type)

async function restore(api: APIRequestContext): Promise<void> {
  await api.put('/api/settings/alerts', { data: ALL_ON })
  const sensors = (await (await api.get('/api/sensors')).json()) as { sensors: { id: string }[] }
  for (const sensor of sensors.sensors) {
    await api.patch(`/api/sensors/${sensor.id}`, { data: { sensitivity: null } })
  }
  await resetState(api)
}

test.describe('설정', () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request)
    await ensureSimulatedSensors(request)
  })
  test.afterAll(async ({ request }) => {
    await restore(request)
  })

  test('모니터링을 끄면 움직임 알림이 만들어지지 않고(기록은 남음), 다시 켜면 만들어진다', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '1. 모니터링 설정' })).toBeVisible()
    const section = page
      .getByRole('heading', { name: '모니터링', exact: true })
      .locator('xpath=ancestor::section[1]')

    // 끄기 → 중요한 알림이 막힌다는 확인 → 저장
    await section.getByRole('switch', { name: /^모니터링 사용/ }).click()
    await section.getByRole('button', { name: '저장' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog.getByText('중요한 알림이 전달되지 않게 됩니다')).toBeVisible()
    await dialog.getByRole('button', { name: '그래도 저장' }).click()
    await expect(section.getByText(/저장했습니다\./)).toBeVisible()
    await expect(page.getByText('중요한 알림이 전달되지 않는 설정입니다')).toBeVisible()

    // 서버에 저장되었고, 새 신호는 기록되지만 알림은 만들어지지 않는다.
    const saved = (await (await request.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    expect(saved.monitoringEnabled).toBe(false)
    await clearSimulated(request)
    await ensureSimulatedSensors(request)
    await sendMotion(request, 'ENTRANCE')
    await expect
      .poll(
        async () =>
          ((await (await request.get('/api/events?limit=5')).json()) as { events: unknown[] })
            .events.length,
      )
      .toBeGreaterThan(0)
    expect(await alertTypes(request)).not.toContain('ENTRANCE_APPROACH')

    // 다시 켜면(설정 저장 → 다음 신호부터 반영) 알림이 만들어진다.
    await section.getByRole('switch', { name: /^모니터링 사용/ }).click()
    await section.getByRole('button', { name: '저장' }).click()
    await expect(section.getByText(/저장했습니다\./)).toBeVisible()
    await sendMotion(request, 'ENTRANCE')
    await expect.poll(() => alertTypes(request), { timeout: 15_000 }).toContain('ENTRANCE_APPROACH')
  })

  test('센서별 민감도: 침대 센서만 높음으로 하면 침대 주변 움직임 알림이 만들어진다', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '센서별 민감도' })).toBeVisible()
    await expect(page.getByText(/하드웨어 민감도 조절을 지원하지 않습니다/).first()).toBeVisible()

    await sendMotion(request, 'BED_SIDE')
    await expect
      .poll(
        async () =>
          ((await (await request.get('/api/events?limit=5')).json()) as { events: unknown[] })
            .events.length,
      )
      .toBeGreaterThan(0)
    expect(await alertTypes(request)).not.toContain('BED_AREA_ACTIVITY') // 기본(보통)에서는 만들지 않는다

    await page.getByLabel(/^시뮬레이션 침대 주변/).selectOption('HIGH')
    await expect(page.getByText('저장했습니다.').first()).toBeVisible()
    // (시뮬레이션 데이터를 지우면 센서도 새로 만들어져 센서별 설정이 사라지므로, 같은 센서로 다시 신호를 보낸다)
    await sendMotion(request, 'BED_SIDE')
    await expect.poll(() => alertTypes(request), { timeout: 15_000 }).toContain('BED_AREA_ACTIVITY')
  })

  test('요일 일정을 저장하면 서버에 남고, 새로고침해도 그대로다', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
    await page.goto('/settings')
    const section = page
      .getByRole('heading', { name: '모니터링', exact: true })
      .locator('xpath=ancestor::section[1]')
    await section.getByRole('button', { name: '평일' }).click()
    await section.getByRole('button', { name: '저장' }).click()
    await expect(section.getByText(/저장했습니다\./)).toBeVisible()
    const saved = (await (await request.get('/api/settings/detection')).json()) as {
      activeWeekdays: number[]
    }
    expect(saved.activeWeekdays).toEqual([0, 1, 2, 3, 4])
    await page.reload()
    await expect(page.getByText('현재 선택: 평일(월~금)')).toBeVisible()
  })

  test('접근성: 설정 화면(밝게)에 위반이 없다', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '4. 서비스 설정' })).toBeVisible()
    await expect(page.getByText('불러오는 중')).toHaveCount(0)
    await expectNoViolations(page, '설정 (밝게)')
  })

  test('어두운 테마: 고르면 바로 적용되고 새로고침해도 유지되며, 주요 화면에 접근성 위반이 없다', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto('/settings')
    await page.getByRole('radio', { name: /^어둡게/ }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('heading', { name: '4. 서비스 설정' })).toBeVisible()
    await expectNoViolations(page, '설정 (어둡게)')

    for (const path of ['/', '/sensors', '/events', '/notifications', '/onboarding']) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByText('불러오는 중')).toHaveCount(0)
      await expectNoViolations(page, `${path} (어둡게)`)
    }

    await page.goto('/settings')
    await page.getByRole('radio', { name: /^기기 설정 따르기/ }).check()
  })

  test('글자 크기를 아주 크게 해도 가로로 넘치지 않고 접근성 위반이 없다', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('radio', { name: /^아주 크게/ }).check()
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'xlarge')
    for (const path of ['/settings', '/']) {
      await page.goto(path)
      await expect(page.getByRole('main')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${path} 가로 넘침`).toBeLessThanOrEqual(0)
    }
    await page.goto('/settings')
    await expectNoViolations(page, '설정 (아주 크게)')
    await page.getByRole('radio', { name: /^보통\s*기본 크기/ }).check()
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'normal')
  })
})
