import { expect, test, type Page } from '@playwright/test'
import { readCredentials } from '../support/credentials'
import { ensureSimulatedSensors, resetState } from '../support/api'

/** 키보드만으로 쓸 수 있는지: 로그인, 건너뛰기 링크, 초점 표시, 메뉴 이동 */

/** 지금 초점이 있는 요소의 이름과 초점 표시(outline) 정보 */
async function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const style = getComputedStyle(el)
    return {
      tag: el.tagName,
      name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30),
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
    }
  })
}

test.describe('로그인', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('키보드만으로 로그인할 수 있다 (Tab 으로 이동, Enter 로 제출)', async ({ page }) => {
    const { email, password } = readCredentials()
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('이메일')).toBeFocused()
    await page.keyboard.type(email)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('비밀번호')).toBeFocused()
    await page.keyboard.type(password)
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  })

  test('잘못된 비밀번호는 오류를 알리고, 오류는 스크린리더가 바로 읽는다 (role=alert)', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByLabel('이메일').fill('nobody@example.com')
    await page.getByLabel('비밀번호').fill('wrong-password')
    await page.getByRole('button', { name: '로그인' }).click()
    await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호가 올바르지 않습니다')
  })
})

test.describe('로그인한 뒤', () => {
  test.beforeEach(async ({ request }) => {
    await resetState(request)
  })

  test('첫 Tab 은 "본문으로 건너뛰기"이고, Enter 를 누르면 본문으로 초점이 간다', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: '본문으로 건너뛰기' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible() // 초점이 있을 때는 눈에도 보인다

    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main')
  })

  test('Tab 으로 지나가는 모든 요소에 눈에 보이는 초점 표시가 있다', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    const stops: string[] = []
    // 화면 안의 요소를 한 바퀴 돈다. (한 바퀴를 넘으면 초점이 브라우저 주소창 쪽으로 나가므로 그 전에 멈춘다)
    const tabbable = await page.evaluate(
      () =>
        document.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')
          .length,
    )
    for (let i = 0; i < Math.min(tabbable, 12); i += 1) {
      await page.keyboard.press('Tab')
      const info = await focused(page)
      expect(info, `${i + 1}번째 Tab 에서 초점이 사라졌습니다.`).not.toBeNull()
      expect(info?.outlineStyle, `${info?.name} 에 초점 표시(outline)가 없습니다.`).not.toBe('none')
      expect(info?.outlineWidth ?? 0).toBeGreaterThanOrEqual(2)
      stops.push(`${info?.tag}:${info?.name}`)
    }
    // 사이드바 메뉴 → 상단 띠(알림 소리·로그아웃) → 본문 순서로 닿는다
    expect(stops.some((s) => s.includes('대시보드'))).toBe(true)
    expect(stops.some((s) => s.includes('알림 소리'))).toBe(true)
  })

  test('Tab 과 Enter 만으로 메뉴 화면을 옮겨 다닐 수 있다', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    const menu = page.getByRole('navigation', { name: '주요 메뉴' })
    await menu.getByRole('link', { name: '알림 센터' }).focus()
    await expect(menu.getByRole('link', { name: '알림 센터' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/notifications$/)
    await expect(page.getByRole('heading', { name: '알림 센터', exact: true })).toBeVisible()
  })

  test('주요 영역에 스크린리더용 이름이 붙어 있다 (랜드마크)', async ({ page, request }) => {
    await ensureSimulatedSensors(request) // 센서가 있어야 "현재 상태" 카드가 나온다
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible()
    await expect(page.getByLabel('시스템 상태')).toBeVisible()
    await expect(page.getByLabel('현재 상태')).toBeVisible()
    // 장식용 아이콘은 스크린리더에서 숨기고, 의미는 글자로 전달한다
    const unlabeledIcons = await page.evaluate(
      () =>
        [...document.querySelectorAll('svg')].filter(
          (s) => s.getAttribute('aria-hidden') !== 'true',
        ).length,
    )
    expect(unlabeledIcons).toBe(0)
  })

  test('알림 소리 버튼은 눌림 상태(aria-pressed)를 알려 준다', async ({ page }) => {
    await page.goto('/')
    const toggle = page.getByRole('button', { name: /알림 소리/ })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.press('Enter')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.press('Space')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})
