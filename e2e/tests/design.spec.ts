import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * 디자인 시스템(/dev/design)의 공통 컴포넌트를 실제 브라우저에서 확인한다.
 * jsdom 은 <dialog> 의 초점 가두기·복귀, 화면 읽기 규칙을 제대로 흉내 내지 못하므로 여기서 본다.
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

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/design')
  await expect(page.getByRole('heading', { level: 1, name: '디자인 시스템' })).toBeVisible()
})

test('토큰 값이 화면에 그대로 나타난다 (색·글자·간격)', async ({ page }, testInfo) => {
  await expect(page.getByText('#4f46e5').first()).toBeVisible()
  await expect(page.getByText('#f5f4fa').first()).toBeVisible()
  // 본문 기준 글자는 16px
  const bodySize = await page.evaluate(() => getComputedStyle(document.body).fontSize)
  expect(bodySize).toBe('16px')
  // 화면 확인용 스크린샷 (DESIGN_SHOT_DIR 를 지정했을 때만 남긴다)
  const dir = process.env.DESIGN_SHOT_DIR
  if (dir) {
    await page.screenshot({ path: `${dir}/design-${testInfo.project.name}.png`, fullPage: true })
  }
})

test('대화상자: 초점이 안으로 들어가고, Esc 로 닫으면 누른 버튼으로 돌아온다', async ({ page }) => {
  const opener = page.getByRole('button', { name: '대화상자', exact: true })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '센서 이름 바꾸기' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription('알림과 기록에 보이는 이름입니다.')
  // 초점은 대화상자 안에 있다
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true)
  // Tab 을 여러 번 눌러도 대화상자 밖으로 나가지 않는다
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true)
  await expectNoViolations(page, '대화상자가 열린 상태')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('확인 대화상자: 안전한 "취소"에 초점, 바깥을 눌러도 닫히지 않는다', async ({ page }) => {
  await page.getByRole('button', { name: '확인 대화상자' }).click()
  const dialog = page.getByRole('alertdialog', { name: '센서를 삭제할까요?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused()
  await expectNoViolations(page, '확인 대화상자가 열린 상태')

  await page.mouse.click(5, 5) // 어두운 바깥 영역
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '삭제' }).click()
  await expect(dialog).toBeHidden()
})

test('시트: 오른쪽·아래 모두 이름이 있고 접근성 위반이 없다', async ({ page }) => {
  for (const [button, side] of [
    ['오른쪽 시트', 'right'],
    ['아래 시트', 'bottom'],
  ] as const) {
    await page.getByRole('button', { name: button }).click()
    const sheet = page.getByRole('dialog', { name: '필터' })
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    const viewport = page.viewportSize()
    expect(box && viewport, '크기를 읽을 수 있어야 합니다').toBeTruthy()
    if (box && viewport) {
      if (side === 'right') expect(Math.round(box.x + box.width)).toBe(viewport.width)
      else expect(Math.round(box.y + box.height)).toBe(viewport.height)
    }
    await expectNoViolations(page, `${button} 가 열린 상태`)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  }
})

test('탭·스위치·슬라이더가 키보드로 동작한다', async ({ page }) => {
  // 탭: 화살표로 옮긴다
  const first = page.getByRole('tab', { name: '진행 중' })
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: '종료됨' })).toHaveAttribute('aria-selected', 'true')

  // 스위치: 스페이스로 켜고 끈다 (상태는 글자로도 보인다)
  const toggle = page.getByRole('switch', { name: /알림 소리/ })
  await toggle.focus()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  // 슬라이더: 화살표로 값이 바뀌고, 읽어 주는 글자(valuetext)가 따라간다
  const slider = page.getByRole('slider', { name: '신호가 없을 때 알릴 시간' })
  await expect(slider).toHaveAttribute('aria-valuetext', '30분')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', '35분')
})

test('말풍선은 키보드 초점만으로 나타난다', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '센서 추가' })
  await trigger.scrollIntoViewIfNeeded() // 스크롤하면 말풍선이 닫히므로 먼저 화면 안으로 옮긴다
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  ) // 스크롤 이벤트가 끝난 뒤에 초점을 준다
  await trigger.focus()
  await expect(page.getByRole('tooltip')).toHaveText('센서 추가')
})

test('토스트: 위험 안내는 스스로 사라지지 않고, 직접 닫을 수 있다', async ({ page }) => {
  await page.getByRole('button', { name: '위험', exact: true }).click()
  const region = page.getByRole('region', { name: /안내 메시지/ })
  await expect(region.getByText('저장하지 못했습니다')).toBeVisible()
  await expectNoViolations(page, '토스트가 떠 있는 상태')
  await page.waitForTimeout(6500) // 성공 안내(5초)보다 오래 지나도 남아 있다
  await expect(region.getByText('저장하지 못했습니다')).toBeVisible()
  await region.getByRole('button', { name: '안내 닫기' }).click()
  await expect(region.getByText('저장하지 못했습니다')).toBeHidden()
})

test('움직임 줄이기 설정이면 회전 애니메이션이 멈춘다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '누르면 처리 중' }).click()
  const spinner = page.locator('button[aria-busy="true"] svg')
  await expect(spinner).toBeVisible()
  expect(await spinner.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('오류 입력은 색뿐 아니라 글자로 설명한다', async ({ page }) => {
  const input = page.getByLabel('이메일')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveAccessibleDescription(/이메일 형식이 아닙니다/)
})
