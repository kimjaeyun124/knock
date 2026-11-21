import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'

/**
 * 메인 대시보드의 일곱 영역과 화면 상태(Success · Empty · Offline)를 실제 브라우저에서 확인한다.
 */

const section = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::section[1]')

async function expectNoViolations(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.help}`),
    label,
  ).toEqual([])
}

test('Success: 인사·상태 카드·모니터링·최근 움직임·센서 요약·7일 요약·빠른 작업이 모두 보인다', async ({
  page,
  request,
}) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')
  await page.goto('/')

  // 1. 인사 · 날짜와 시간 · 모니터링 여부 · 마지막 데이터 수신
  await expect(page.getByRole('heading', { level: 1, name: '대시보드' })).toBeVisible()
  await expect(page.getByText('안녕하세요. 오늘의 안전 상태를 확인하세요.')).toBeVisible()
  await expect(page.getByText(/\d{4}년 \d+월 \d+일 .요일 · /)).toBeVisible()
  await expect(page.getByText('모니터링 켜짐')).toBeVisible()
  await expect(page.getByText(/마지막 데이터 수신:/)).toBeVisible()

  // 2. 실시간 안전 상태 카드 — 가장 먼저 보인다
  const status = page.getByLabel('현재 상태')
  await expect(status).toBeInViewport()
  await expect(status).toContainText('확인 필요')
  await expect(status).toContainText('즉시 확인 권장')
  await expect(status).toContainText('마지막 업데이트:')

  // 3. 현재 모니터링
  const monitoring = section(page, '현재 모니터링')
  await expect(monitoring).toContainText('감지 일정')
  await expect(monitoring).toContainText('연결된 센서')
  await expect(monitoring).toContainText('3개 / 사용 중 3개')
  await expect(monitoring).toContainText('정상 작동 중인 센서')

  // 4. 최근 움직임 → 전체 기록
  const recent = section(page, '최근 움직임')
  await expect(recent.getByText(/움직임 감지/).first()).toBeVisible()
  await expect(recent.locator('li').first()).toBeVisible()

  // 5. 센서 요약: 세 구역
  const sensors = section(page, '센서 요약')
  for (const zone of ['침대 주변', '이동 경로', '현관']) await expect(sensors).toContainText(zone)
  await expect(sensors.getByText('연결됨').first()).toBeVisible()
  await expect(sensors.getByText(/배터리/).first()).toBeVisible()

  // 6. 최근 7일 요약: 그래프(표로도 제공)와 범례
  const weekly = section(page, '최근 7일 움직임')
  await expect(weekly.getByText('오늘')).toBeVisible()
  await expect(weekly.getByText('감지 건수').first()).toBeVisible()
  await expect(weekly.getByRole('table')).toHaveCount(1)

  // 7. 빠른 작업
  const quick = section(page, '빠른 작업')
  await expect(quick.getByRole('link')).toHaveCount(3)

  await expectNoViolations(page, '대시보드 (확인 필요 상태)')
})

test('다른 화면으로 이동할 수 있다: 전체 기록 · 센서 상세 · 센서 관리 · 알림 설정', async ({
  page,
  request,
}) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')

  await page.goto('/')
  await section(page, '최근 움직임').getByRole('link', { name: '전체 기록 보기' }).click()
  await expect(page).toHaveURL(/\/events$/)
  await expect(page.getByRole('heading', { name: '움직임 기록', exact: true })).toBeVisible()

  await page.goto('/')
  await section(page, '센서 요약')
    .getByRole('link', { name: /시뮬레이션/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/sensors\/[^/]+$/)
  await expect(page.getByRole('heading', { name: '센서 상세' })).toBeVisible()

  await page.goto('/')
  await section(page, '빠른 작업')
    .getByRole('link', { name: /센서 관리/ })
    .click()
  await expect(page).toHaveURL(/\/sensors$/)

  await page.goto('/')
  await section(page, '빠른 작업')
    .getByRole('link', { name: /알림 설정/ })
    .click()
  await expect(page).toHaveURL(/\/settings\/notifications$/)
})

test('Empty: 센서가 없으면 "정상"처럼 보이지 않고 시작 전 상태로 안내한다', async ({
  page,
  request,
}) => {
  await resetState(request) // 시뮬레이션 센서를 모두 지운다
  await page.goto('/')
  await expect(page.getByText('아직 등록된 센서가 없습니다')).toBeVisible()
  await expect(page.getByRole('link', { name: '센서 등록' })).toBeVisible()
  await expect(page.getByText('모니터링 시작 전')).toBeVisible()
  await expect(page.getByLabel('현재 상태')).toHaveCount(0)
  await expectNoViolations(page, '대시보드 (센서 없음)')
})

test('Offline: 연결이 끊기면 상태 카드가 "연결 끊김"이 되고, 받아 둔 정보를 지금 상태로 보여 주지 않는다', async ({
  page,
  request,
  context,
}) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
  await page.goto('/')
  await expect(page.getByLabel('현재 상태')).toContainText('정상')

  await context.setOffline(true)
  const status = page.getByLabel('현재 상태')
  await expect(status).toContainText('연결 끊김')
  await expect(status).toContainText('마지막으로 확인한 상태: 정상')
  // "정상"일 때의 안심 문구(안전을 보장하지 않는다는 설명)는 지금 상태 설명으로 더 나오지 않는다
  await expect(status).not.toContainText('센서가 보낸 움직임 신호를 기준으로 한 표시입니다')
  await expect(page.getByText('모니터링 켜짐 (마지막 확인 기준)')).toBeVisible()
  await expect(page.getByText(/연결이 끊기기 전에 받은/).first()).toBeVisible()
  await expectNoViolations(page, '대시보드 (연결 끊김)')

  await context.setOffline(false)
  await expect(page.getByLabel('현재 상태')).toContainText('정상', { timeout: 30_000 })
  await expect(page.getByText(/연결이 끊기기 전에 받은/)).toHaveCount(0)
})
