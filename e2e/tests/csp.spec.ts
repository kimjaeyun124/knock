import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'

/**
 * 운영 빌드를 실제 CSP 헤더 아래에서 돌려 본다. (apps/web/csp.ts, docs/OPERATIONS.md)
 * 정책이 너무 좁아 화면이 깨지지는 않는지, 반대로 정책이 실제로 적용되고 있는지 둘 다 확인한다.
 */

interface Violation {
  directive: string
  blocked: string
  /** 위반을 일으킨 코드 위치 (실패했을 때 원인을 바로 찾기 위해 남긴다) */
  where: string
}

async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store: { directive: string; blocked: string; where: string }[] = []
    Object.assign(window, { __csp: store })
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
        where: `${event.sourceFile}:${event.lineNumber}:${event.columnNumber} ${event.sample}`,
      })
    })
  })
}
const violations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: Violation[] }).__csp)

test.beforeEach(async ({ request }) => {
  await resetState(request)
})

test('운영 빌드 문서에 CSP 헤더가 붙는다', async ({ page }) => {
  const response = await page.goto('/')
  const csp = response?.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).not.toContain("'unsafe-eval'")
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
})

test('정책 아래에서도 핵심 화면과 실시간 연결이 정상 동작하고, 위반이 한 건도 없다', async ({
  page,
  request,
}) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await watchViolations(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  await expect(page.getByLabel('시스템 상태')).toContainText('실시간 연결됨') // WebSocket 이 정책에 막히지 않는다

  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')
  await expect(page.getByLabel('새 알림')).toContainText('현관 근처에서 움직임이 감지되었습니다')
  // 막대 그래프(style 속성)와 경로별 지연 로딩 코드도 정책에 걸리지 않는다
  await expect(page.getByLabel('현재 상태')).toContainText('즉시 확인 권장')

  for (const [path, heading] of [
    ['/dev/simulator', '센서 시뮬레이터'],
    ['/settings/notifications', '알림 채널'],
    ['/events', '움직임 기록'],
    ['/notice', '서비스 안내와 한계'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  expect(await violations(page)).toEqual([])
  expect(consoleErrors.filter((text) => /Content Security Policy|Refused to/i.test(text))).toEqual(
    [],
  )
})

test('서비스 워커(푸시)를 같은 출처에서 등록할 수 있다', async ({ page }) => {
  await watchViolations(page)
  await page.goto('/settings/notifications')
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js')
    const value = registration.scope
    await registration.unregister()
    return value
  })
  expect(scope).toMatch(/\/$/)
  expect(await violations(page)).toEqual([])
})

test('정책이 실제로 적용되고 있다: 인라인 스크립트와 외부 스크립트는 막힌다', async ({ page }) => {
  await watchViolations(page)
  await page.goto('/notice')
  await expect(page.getByRole('heading', { name: '서비스 안내와 한계' })).toBeVisible()

  const ran = await page.evaluate(() => {
    const el = document.createElement('script')
    el.textContent = 'window.__injected = true'
    document.body.appendChild(el)
    const external = document.createElement('script')
    external.src = 'https://evil.example/x.js'
    document.body.appendChild(external)
    return (window as unknown as { __injected?: boolean }).__injected === true
  })
  expect(ran).toBe(false)
  await expect
    .poll(async () => (await violations(page)).map((v) => v.directive))
    .toContain('script-src-elem')
})

test('디자인 시스템의 대화상자·토스트·말풍선·슬라이더도 정책 위반이 없고, 글꼴은 같은 출처에서 온다', async ({
  page,
}) => {
  const fonts: { url: string; status: number }[] = []
  page.on('response', (response) => {
    if (/\.woff2(\?|$)/.test(response.url()))
      fonts.push({ url: response.url(), status: response.status() })
  })
  await watchViolations(page)

  await page.goto('/dev/design')
  await expect(page.getByRole('heading', { level: 1, name: '디자인 시스템' })).toBeVisible()

  const trigger = page.getByRole('button', { name: '센서 추가' })
  await trigger.scrollIntoViewIfNeeded()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  ) // 스크롤 이벤트가 끝난 뒤에 초점을 준다
  await trigger.focus() // 말풍선
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.getByRole('slider', { name: '신호가 없을 때 알릴 시간' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '성공', exact: true }).click() // 토스트
  await expect(
    page.getByRole('region', { name: /안내 메시지/ }).getByText('저장했습니다'),
  ).toBeVisible()
  await page.getByRole('button', { name: '대화상자', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '센서 이름 바꾸기' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '오른쪽 시트' }).click()
  await expect(page.getByRole('dialog', { name: '필터' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Pretendard 조각 파일이 실제로 같은 출처에서 내려왔다 (data: 로 끼워 넣지 않았다)
  await expect.poll(() => fonts.length).toBeGreaterThan(0)
  expect(
    fonts.every(
      (font) => font.status === 200 && font.url.startsWith(page.url().split('/dev')[0] ?? ''),
    ),
  ).toBe(true)
  expect(await violations(page)).toEqual([])
})
