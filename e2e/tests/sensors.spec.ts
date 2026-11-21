import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resetState } from '../support/api'

/**
 * 센서 관리: 단계별 등록 → 실제 장치처럼 신호 보내기(연결 확인) → 이름 수정 → 사용 끄기 → 연결 해제.
 * 장치는 발급받은 토큰으로 수집 API 에 직접 신호를 보내 흉내 낸다. (서버·화면은 실제)
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

test.beforeEach(async ({ request }) => {
  await resetState(request)
})

test('등록(5단계) → 연결 확인 → 목록 → 이름 수정 → 사용 끄기 → 연결 해제', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  const name = `E2E 복도 ${Date.now() % 100000}`
  const renamed = `${name} (수정)`

  // 1~3단계: 유형 → 연결 방식 → 이름과 설치 위치
  await page.goto('/sensors/new')
  await expect(page.getByText('1/5 단계 · 센서 유형')).toBeVisible()
  await page.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('2/5 단계 · 연결 방식')).toBeVisible()
  await expect(page.getByRole('radio', { name: /블루투스·지그비/ })).toBeDisabled()
  await expectNoViolations(page, '센서 등록 2단계')
  await page.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('3/5 단계 · 이름과 설치 위치')).toBeVisible()
  await page.getByLabel('설치 구역').selectOption('PATH')
  await expect(page.getByLabel('센서 이름')).toHaveValue('이동 경로 센서')
  await page.getByLabel('센서 이름').fill(name)
  await page.getByRole('button', { name: '다음' }).click()

  // 4단계: 확인 → 등록 → 토큰 (한 번만)
  await expect(page.getByText('내용을 확인하고 등록하세요')).toBeVisible()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '센서 등록' }).click()
  const token = (await page.getByTestId('device-token').textContent())?.trim() ?? ''
  expect(token).toMatch(/^tsn_/)
  await page.getByRole('button', { name: '다음: 연결 확인' }).click()

  // 5단계: 첫 신호 전에는 안내만 한다
  await expect(page.getByText('5/5 단계 · 연결 확인')).toBeVisible()
  await expect(page.getByText('아직 첫 신호를 받지 못했습니다')).toBeVisible()

  // 장치가 토큰으로 신호를 보낸다 (연결은 정상, 배터리는 15%)
  const heartbeat = await request.post('/api/ingest/v1/heartbeat', {
    headers: { Authorization: `Bearer ${token}` },
    data: { batteryPercent: 15, firmware: '1.0.0' },
  })
  expect(heartbeat.ok(), await heartbeat.text()).toBe(true)
  await expect(page.getByText('첫 신호를 받았습니다. 센서가 연결되었습니다')).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('link', { name: '등록 마치기' }).click()

  // 상세: 연결됨 + 배터리 부족이 함께 보인다
  await expect(page.getByRole('heading', { name: '센서 상세' })).toBeVisible()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  // 헤더에도 같은 글자가 있으므로 본문에서만 찾는다
  const main = page.getByRole('main')
  await expect(main.getByText('연결됨', { exact: true })).toBeVisible()
  await expect(main.getByText('배터리 부족 (15%)')).toBeVisible()
  await expect(page.getByText(/배터리가 부족합니다. 곧 교체하거나 충전해 주세요/)).toBeVisible()
  await expectNoViolations(page, '센서 상세')

  // 연결 상태 확인
  await page.getByRole('button', { name: '연결 상태 확인' }).click()
  await expect(page.getByText(/에 확인했습니다: 연결됨/)).toBeVisible()

  // 목록: 카드에 모든 정보와 상세 설정 버튼
  await page.goto('/sensors')
  const card = page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::li[1]')
  await expect(card).toContainText('이동 경로 · 움직임 감지 센서 · 사용 중')
  await expect(card).toContainText('연결됨')
  await expect(card).toContainText('배터리 부족 (15%)')
  await expect(card).toContainText('마지막 통신')
  await expect(page.getByText('확인이 필요한 센서가 있습니다')).toBeVisible()
  await card.getByRole('link', { name: /상세 설정/ }).click()
  await expect(page.getByRole('heading', { name: '센서 상세' })).toBeVisible()

  // 이름 수정 → 화면에 바로 반영
  await page.getByLabel('센서 이름').fill(renamed)
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText('저장했습니다.')).toBeVisible()
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible()

  // 사용 끄기: 취소하면 그대로, 확인하면 꺼진다
  const toggle = page.getByRole('switch', { name: /이 센서 사용/ })
  await toggle.click()
  const dialog = page.getByRole('alertdialog', { name: '이 센서 사용을 끌까요?' })
  await expect(dialog).toBeVisible()
  await expectNoViolations(page, '사용 끄기 확인 대화상자')
  await dialog.getByRole('button', { name: '취소' }).click()
  await expect(toggle).toBeChecked()
  await toggle.click()
  await page.getByRole('alertdialog').getByRole('button', { name: '사용 끄기' }).click()
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText('사용 안 함').first()).toBeVisible()

  // 연결 해제: 확인 대화상자 → 목록에서 사라진다
  await page.getByRole('button', { name: '센서 연결 해제' }).click()
  const disconnect = page.getByRole('alertdialog', { name: '센서 연결을 해제할까요?' })
  await expect(disconnect).toContainText('되돌릴 수 없습니다')
  await disconnect.getByRole('button', { name: '연결 해제' }).click()
  await expect(page).toHaveURL(/\/sensors$/)
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toHaveCount(0)
})

test('시뮬레이션 센서는 별도 방식으로만 만들고, 실제 장치가 아니라고 알린다', async ({ page }) => {
  await page.goto('/sensors/new')
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('radio', { name: /시뮬레이션 센서/ }).check()
  await page.getByRole('button', { name: '다음' }).click()
  await expect(page.getByText('3/3 단계 · 시뮬레이션 센서 만들기')).toBeVisible()
  await expect(page.getByText('시뮬레이션 센서는 실제 장치가 아닙니다')).toBeVisible()
  await page.getByRole('button', { name: '시뮬레이션 센서 만들기' }).click()
  await expect(page.getByText(/시뮬레이션 센서 3개가 준비되었습니다/)).toBeVisible()
  await page.getByRole('link', { name: '센서 목록 보기' }).click()
  await expect(page.getByText('시뮬레이션', { exact: true }).first()).toBeVisible()
})
