import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState, sendMotion } from '../support/api'

/**
 * 움직임 기록(타임라인): 실제 서버가 만든 기록(움직임·센서 상태·알림)을 조건으로 찾고, 상세를 열고, 더 불러온다.
 * 시각은 브라우저 시간대(Asia/Seoul)로 보인다.
 */

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.help}`),
    label,
  ).toEqual([])
}

const timeline = (page: Page) => page.getByRole('region', { name: '이벤트 타임라인' })
const cards = (page: Page) => timeline(page).getByRole('listitem')

/** 좁은 화면에서는 조건이 접혀 있다. 사람이 하듯 먼저 펼친다. */
async function openFilters(page: Page): Promise<void> {
  const details = page.locator('details').first()
  await expect(details).toBeVisible() // 화면이 그려진 뒤에 열림 상태를 읽는다
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) {
    await details.locator('summary').click()
  }
  await expect(page.getByLabel('이벤트 종류')).toBeVisible()
}

/** 현관 시나리오(긴급 알림) + 침대 주변 움직임 + 배터리 위급 */
async function seed(page: Page, request: Parameters<typeof resetState>[0]): Promise<void> {
  await resetState(request)
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')
  await sendMotion(request, 'PATH')
  const battery = await request.post('/api/dev/simulator/battery', {
    data: { zone: 'PATH', batteryPercent: 9 },
  })
  expect(battery.ok(), await battery.text()).toBe(true)
  await page.goto('/events')
  await expect(
    page.getByRole('heading', { level: 1, name: '움직임 기록', exact: true }),
  ).toBeVisible()
}

test('타임라인: 날짜별로 묶이고, 시각·종류·위치·설명·주의 수준·알림 여부가 보인다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  await expect(cards(page).first()).toBeVisible()
  await expect(timeline(page).getByRole('heading', { level: 2 }).first()).toContainText('오늘')

  // 여섯 가지 유형 중 이번에 만든 것
  await expect(timeline(page)).toContainText('현관 주변 움직임 (추정)')
  await expect(timeline(page)).toContainText('일반 움직임')
  await expect(timeline(page)).toContainText('배터리 부족')
  const entrance = cards(page).filter({ hasText: '현관 주변 움직임 (추정)' }).first()
  await expect(entrance).toContainText('알림 발생')
  await expect(entrance).toContainText('즉시 확인 권장')
  await expect(entrance).toContainText('추정')
  await expect(entrance.locator('time')).toHaveText(/^(오전|오후) \d{1,2}:\d{2}$/)
  await expect(entrance).toContainText('시뮬레이션')

  // 요약
  const summary = page.getByRole('region', { name: '이벤트 요약' })
  await expect(summary).toContainText('전체 감지 건수')
  await expect(summary).toContainText('주의 이벤트')
  await expect(summary).toContainText('최근 감지 시간')
  await expect(summary.getByText('기록 없음')).toHaveCount(0)

  await expectNoViolations(page, '움직임 기록')
})

test('조건: 종류·주의 수준·알림 여부로 찾고, 주소에 남아 새로고침해도 유지되며, 초기화할 수 있다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  const total = await cards(page).count()

  await openFilters(page)
  await page.getByLabel('이벤트 종류').selectOption('LOW_BATTERY')
  await expect(page).toHaveURL(/type=LOW_BATTERY/)
  await expect(cards(page).first()).toContainText('배터리 부족')
  // 조건이 바뀌는 동안 목록이 잠시 비거나 이전 결과가 남을 수 있으므로, 새 결과로 바뀔 때까지 기다린다.
  await expect(cards(page).filter({ hasNotText: '배터리' })).toHaveCount(0)
  await expect.poll(() => cards(page).count()).toBeGreaterThan(0)
  const batteryCount = await cards(page).count()
  expect(batteryCount).toBeLessThan(total)
  for (const text of await cards(page).allTextContents()) expect(text).toContain('배터리')

  // 새로고침해도 같은 조건
  await page.reload()
  await openFilters(page)
  await expect(page.getByLabel('이벤트 종류')).toHaveValue('LOW_BATTERY')
  await expect(cards(page)).toHaveCount(batteryCount)

  // 주의 수준 + 알림 여부를 더하면 더 좁아진다
  await page.getByLabel('이벤트 종류').selectOption('')
  await page.getByLabel('주의 수준').selectOption('URGENT')
  await expect(page).toHaveURL(/attention=URGENT/)
  for (const text of await cards(page).allTextContents()) expect(text).toContain('즉시 확인 권장')
  await page.getByLabel('알림 발생 여부').selectOption('false')
  await expect(page.getByText('조건에 맞는 기록이 없습니다')).toBeVisible() // 긴급인데 알림이 없는 기록은 없다

  await page.getByRole('main').getByRole('button', { name: '조건 초기화' }).last().click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(cards(page)).toHaveCount(total)
  await expect(page.getByLabel('주의 수준')).toHaveValue('')
})

test('정렬: 오래된순은 최신순의 정확히 반대이고, 기간 빠른 선택이 동작한다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  const newest = await cards(page).locator('time').allTextContents()
  await openFilters(page)
  await page.getByLabel('정렬').selectOption('asc')
  await expect(page).toHaveURL(/order=asc/)
  await expect
    .poll(async () => (await cards(page).locator('time').allTextContents()).join())
    .toBe([...newest].reverse().join())

  await page.getByRole('button', { name: '오늘', exact: true }).click()
  await expect(page.getByRole('button', { name: '오늘', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cards(page).first()).toBeVisible() // 방금 만든 기록은 오늘이다
  await page.getByRole('button', { name: '최근 30일' }).click()
  await expect(page.getByRole('button', { name: '최근 30일' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // 시작 날짜가 종료 날짜보다 늦으면 조회하지 않고 이유를 알린다
  await page.getByLabel('시작 날짜').fill('2999-01-01')
  await expect(page.getByText('조회 기간을 확인해 주세요')).toBeVisible()
  await expect(page.getByRole('region', { name: '이벤트 요약' })).toHaveCount(0)
})

test('상세: 규칙·알림 처리·센서 상태를 보여 주고, 주소로 열리며, 알림 상세로 이어진다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  await cards(page)
    .filter({ hasText: '현관 주변 움직임 (추정)' })
    .first()
    .getByRole('button')
    .click()
  const dialog = page.getByRole('dialog', { name: '현관 주변 움직임 (추정)' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/event=mov_/)
  await expect(dialog.getByRole('heading', { name: '판단에 사용된 규칙' })).toBeVisible()
  await expect(dialog).toContainText('야간')
  await expect(dialog.getByRole('heading', { name: '알림 처리' })).toBeVisible()
  await expect(dialog).toContainText('현관 근처 움직임')
  await expect(dialog).toContainText('센서 위치와 규칙에 따른 추정입니다')
  await expect(dialog).toContainText('이 기록이 만들어진 때의 상태가 아닙니다')
  await expect(dialog).toContainText('Asia/Seoul')
  await expectNoViolations(page, '이벤트 상세')

  // 새로고침해도 같은 상세가 열린다
  await page.reload()
  await expect(page.getByRole('dialog', { name: '현관 주변 움직임 (추정)' })).toBeVisible()

  // Esc 로 닫으면 주소에서 사라진다
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).not.toHaveURL(/event=/)

  // 알림 상세로 이어진다
  await cards(page)
    .filter({ hasText: '현관 주변 움직임 (추정)' })
    .first()
    .getByRole('button')
    .click()
  await page.getByRole('dialog').getByRole('link', { name: '알림 자세히 보기' }).click()
  await expect(page).toHaveURL(/\/notifications\/[^/]+$/)
  await expect(page.getByRole('heading', { name: '알림 상세' })).toBeVisible()
})

test('더 보기: 30건씩 이어 읽고, 마지막이면 안내한다', async ({ page, request }) => {
  test.setTimeout(120_000)
  await resetState(request)
  await ensureSimulatedSensors(request)
  for (let i = 0; i < 34; i += 1) await sendMotion(request, i % 2 === 0 ? 'BED_SIDE' : 'PATH')
  await page.goto('/events')
  await expect(cards(page)).toHaveCount(30)
  await expect(page.getByText(/30건 표시 중 · 아직 불러오지 않은 기록이 더 있습니다/)).toBeVisible()
  await page.getByRole('button', { name: '더 보기' }).click()
  await expect(cards(page).nth(30)).toBeVisible()
  await expect(page.getByText(/마지막 기록입니다/)).toBeVisible()
  await expect(page.getByRole('button', { name: '더 보기' })).toHaveCount(0)
  expect(await cards(page).count()).toBeGreaterThanOrEqual(34)
})

test('빈 상태·오류: 기록이 없으면 안내하고, 불러오지 못하면 숨기지 않고 다시 시도할 수 있다', async ({
  page,
  request,
}) => {
  await resetState(request)
  await page.goto('/events')
  await expect(page.getByText('이 기간에 기록된 움직임이 없습니다')).toBeVisible()
  await expect(page.getByRole('region', { name: '이벤트 요약' })).toContainText('기록 없음')

  // 서버 오류를 흉내 낸다
  await page.route('**/api/timeline?**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INTERNAL_ERROR',
          message: '기록을 읽는 중 문제가 생겼습니다.',
          requestId: 'req-e2e',
        },
      }),
    }),
  )
  await page.goto('/events?type=LOW_BATTERY')
  await expect(page.getByText('기록을 불러오지 못했습니다')).toBeVisible()
  await expect(page.getByText('기록을 읽는 중 문제가 생겼습니다.')).toBeVisible()
  await expect(page.getByText(/req-e2e/)).toBeVisible()
  await expect(page.getByText('조건에 맞는 기록이 없습니다')).toHaveCount(0) // 실패를 "없음"으로 보이지 않는다
  await expectNoViolations(page, '움직임 기록 (오류)')

  await page.unroute('**/api/timeline?**')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('조건에 맞는 기록이 없습니다')).toBeVisible()
})

test('좁은 화면: 가로로 넘치지 않고, 시간과 이벤트 종류가 카드 맨 앞에 보인다', async ({
  page,
  request,
}, testInfo) => {
  await seed(page, request)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  const first = cards(page).first()
  await expect(first.locator('time')).toBeVisible()
  await expect(first.getByText(/움직임|배터리|센서 연결/).first()).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    // 좁은 화면에서는 조건이 접혀 있어 기록이 먼저 보인다
    await expect(page.getByText('기본 조건')).toBeVisible()
    await expect(page.getByLabel('이벤트 종류')).toBeHidden()
    await page.getByText('기본 조건').click()
    await expect(page.getByLabel('이벤트 종류')).toBeVisible()
  }
})
