import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, playScenario, resetState } from '../support/api'

/**
 * 알림 센터: 읽지 않은 알림 수 · 보기(전체/읽지 않음/중요) · 읽음 처리 · 실시간 갱신 · 관련 움직임 기록.
 * 읽음(봤다)과 처리 상태(확인·종료)가 서로 다른 값임을 실제 서버로 확인한다.
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

const list = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 2 }) })
const summary = (page: Page) =>
  page.getByText('읽지 않은 알림', { exact: true }).locator('xpath=ancestor::section[1]')
const unreadCount = async (page: Page): Promise<number> => {
  const text = (await summary(page).locator('p.text-numeric').first().textContent()) ?? ''
  return Number(/(\d+)/.exec(text)?.[1] ?? Number.NaN)
}
const setBattery = (
  request: Parameters<typeof resetState>[0],
  zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE',
  batteryPercent: number,
) => request.post('/api/dev/simulator/battery', { data: { zone, batteryPercent } })

/** 긴급(현관 움직임) + 배터리 위급(이동 경로) 알림 */
async function seed(page: Page, request: Parameters<typeof resetState>[0]): Promise<void> {
  await resetState(request)
  await ensureSimulatedSensors(request)
  await playScenario(request, 'entrance')
  const battery = await setBattery(request, 'PATH', 9)
  expect(battery.ok(), await battery.text()).toBe(true)
  await page.goto('/notifications')
  await expect(
    page.getByRole('heading', { level: 1, name: '알림 센터', exact: true }),
  ).toBeVisible()
  await expect(list(page).first()).toBeVisible()
}

test('읽지 않은 알림 수와 목록: 읽음·처리 상태·전달 상태가 따로 보이고, 읽음이 해결이 아님을 알린다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  expect(await unreadCount(page)).toBeGreaterThanOrEqual(2)
  await expect(summary(page)).toContainText('읽었다고 해서 상황이 해결된 것은 아니며')

  const entrance = list(page).filter({ hasText: '현관 근처에서 움직임이 감지되었습니다' }).first()
  await expect(entrance).toContainText('읽지 않음')
  await expect(entrance).toContainText('즉시 확인 권장')
  await expect(entrance).toContainText('진행 중') // 처리 상태
  await expect(entrance).toContainText(
    /대기|전송 시도|전송 성공|전달 확인 불가|전송 실패|연동되지 않은 채널/,
  )
  await expect(entrance.getByRole('link', { name: /관련 움직임 기록 보기/ })).toBeVisible()
  await expectNoViolations(page, '알림 센터')
})

test('보기: 읽지 않음 · 중요 · 전체가 서버 조건으로 거르고 주소에 남는다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  const total = await list(page).count()

  await page.getByRole('tab', { name: /읽지 않음/ }).click()
  await expect(page).toHaveURL(/view=unread/)
  await expect(list(page)).toHaveCount(total) // 아직 아무것도 읽지 않았다

  await page.getByRole('tab', { name: '중요' }).click()
  await expect(page).toHaveURL(/view=important/)
  // 새 조건으로 다시 읽어 올 때까지 기다린다. (이전 결과가 남아 있거나 잠시 비는 순간을 지나야 한다)
  await expect(list(page).filter({ hasText: '참고' })).toHaveCount(0)
  await expect.poll(() => list(page).count()).toBeGreaterThan(0)
  for (const text of await list(page).allTextContents()) expect(text).not.toContain('참고')

  // 새로고침해도 같은 보기
  await page.reload()
  await expect(page.getByRole('tab', { name: '중요' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('tab', { name: '전체' }).click()
  await expect(page).toHaveURL(/\/notifications$/)
  await expect(list(page)).toHaveCount(total)
})

test('개별 읽음: 화면에 바로 반영되고 서버에 남으며, 알림은 여전히 진행 중이다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  const before = await unreadCount(page)
  const entrance = list(page).filter({ hasText: '현관 근처에서 움직임이 감지되었습니다' }).first()
  await entrance.getByRole('button', { name: /읽음으로 표시/ }).click()

  await expect(entrance).toContainText('읽음')
  await expect(entrance).not.toContainText('읽지 않음')
  await expect(entrance).toContainText('진행 중') // 읽어도 처리 상태는 그대로
  await expect(entrance).toContainText('읽었지만 아직 확인 처리하지 않은 알림입니다')
  await expect.poll(() => unreadCount(page)).toBe(before - 1)
  // 헤더의 알림 센터 버튼 숫자도 같다
  await expect(
    page
      .getByRole('banner')
      .first()
      .getByRole('link', { name: /알림 센터/ }),
  ).toHaveAccessibleName(
    before - 1 > 0 ? new RegExp(`읽지 않은 알림\\s*${before - 1}\\s*건`) : '알림 센터',
  )

  // 서버에 저장되어 새로고침해도 그대로다
  await page.reload()
  const after = list(page).filter({ hasText: '현관 근처에서 움직임이 감지되었습니다' }).first()
  await expect(after).toContainText('읽음')
  await expect(after).toContainText('진행 중')
  await expect.poll(() => unreadCount(page)).toBe(before - 1)
})

test('모두 읽음: 확인 대화상자를 거치고, 모두 읽음이 되지만 처리 상태는 그대로다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  await page.getByRole('button', { name: '모두 읽음으로 표시' }).click()
  const dialog = page.getByRole('alertdialog', { name: '모든 알림을 읽음으로 표시할까요?' })
  await expect(dialog).toContainText('처리 상태도 그대로입니다')
  await expectNoViolations(page, '모두 읽음 확인 대화상자')
  await dialog.getByRole('button', { name: '취소' }).click()
  expect(await unreadCount(page)).toBeGreaterThanOrEqual(2) // 취소하면 그대로

  await page.getByRole('button', { name: '모두 읽음으로 표시' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '모두 읽음으로 표시' }).click()
  await expect.poll(() => unreadCount(page)).toBe(0)
  await expect(page.getByRole('button', { name: '모두 읽음으로 표시' })).toBeDisabled()
  for (const text of await list(page).allTextContents()) {
    expect(text).toContain('읽음')
    expect(text).not.toContain('읽지 않음')
  }
  await expect(list(page).filter({ hasText: '진행 중' }).first()).toBeVisible() // 해결된 것이 아니다

  // 읽지 않음 보기는 이제 비어 있고, 그렇다고 모두 처리된 것은 아님을 밝힌다
  await page.getByRole('tab', { name: '읽지 않음' }).click()
  await expect(page.getByText('읽지 않은 알림이 없습니다')).toBeVisible()
  await expect(page.getByText(/확인·종료하지 않은 것이 있을 수 있습니다/)).toBeVisible()
})

test('실시간: 새 알림이 새로고침 없이 맨 위에 나타나고 수가 오르며, 중복되지 않는다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  await page.getByRole('button', { name: '모두 읽음으로 표시' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '모두 읽음으로 표시' }).click()
  await expect.poll(() => unreadCount(page)).toBe(0)
  await page.evaluate(() => {
    ;(window as unknown as { __kept: boolean }).__kept = true
  })

  // 이 화면이 열려 있는 동안 침대 센서 배터리가 위급해진다
  const res = await setBattery(request, 'BED_SIDE', 8)
  expect(res.ok(), await res.text()).toBe(true)
  const fresh = list(page)
    .filter({ hasText: /침대|배터리/ })
    .filter({ hasText: '배터리' })
  await expect(fresh.first()).toBeVisible({ timeout: 15_000 })
  await expect(fresh.first()).toContainText('읽지 않음')
  await expect.poll(() => unreadCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
  // 같은 알림이 두 장 생기지 않는다 (제목이 같은 카드는 하나)
  const titles = await list(page).locator('h2').allTextContents()
  expect(new Set(titles).size).toBe(titles.length)
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true) // 다시 불러오지 않았다
})

test('연결이 끊겼다 돌아오면 놓친 알림을 API 로 다시 받아 보충한다', async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(120_000)
  await seed(page, request)
  const before = await list(page).count()

  await context.setOffline(true)
  await expect(page.getByText('연결 끊김').first()).toBeVisible()
  // 끊겨 있는 동안 서버에 새 알림이 생긴다 (화면은 소켓 신호를 받을 수 없다)
  const res = await setBattery(request, 'BED_SIDE', 7)
  expect(res.ok(), await res.text()).toBe(true)

  await context.setOffline(false)
  await expect(list(page)).toHaveCount(before + 1, { timeout: 45_000 })
  await expect(page.getByText('연결 정상').first()).toBeVisible({ timeout: 30_000 })
})

test('관련 움직임 기록: 움직임 알림은 근거 신호, 센서 알림은 센서 상태 기록으로 이어진다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  // 움직임 알림 → 움직임 기록 상세
  await list(page)
    .filter({ hasText: '현관 근처에서 움직임이 감지되었습니다' })
    .first()
    .getByRole('link', { name: /관련 움직임 기록 보기/ })
    .click()
  await expect(page).toHaveURL(/\/events\?.*event=mov_/)
  const dialog = page.getByRole('dialog', { name: '현관 주변 움직임 (추정)' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('알림 처리')

  // 센서 알림 → 센서 상태 기록 상세
  await page.goto('/notifications')
  await list(page)
    .filter({ hasText: '배터리' })
    .first()
    .getByRole('link', { name: /관련 움직임 기록 보기/ })
    .click()
  await expect(page).toHaveURL(/event=sta_/)
  await expect(page.getByRole('dialog', { name: '배터리 부족' })).toBeVisible()
})

test('상세: 읽음 표시와 처리가 따로 있고, 전달 상태를 확인할 수 없는 채널을 성공으로 쓰지 않는다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  await list(page)
    .filter({ hasText: '현관 근처에서 움직임이 감지되었습니다' })
    .first()
    .getByRole('link', { name: '현관 근처에서 움직임이 감지되었습니다', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '알림 상세' })).toBeVisible()
  const read = page
    .getByRole('heading', { name: '읽음 표시' })
    .locator('xpath=ancestor::section[1]')
  await expect(read).toContainText('읽어도 해결된 것은 아닙니다')
  await read.getByRole('button', { name: '읽음으로 표시' }).click()
  await expect(read).toContainText('이 알림을 읽음으로 표시했습니다.')
  // 읽어도 처리 버튼은 그대로 있다
  await expect(page.getByRole('button', { name: '확인했습니다' })).toBeVisible()
  await expect(page.getByRole('link', { name: '관련 움직임 기록 보기' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '알림 전달 결과' })).toBeVisible()
  await expectNoViolations(page, '알림 상세')
})

test('오류·빈 상태: 알림이 없으면 안내하고, 불러오지 못하면 숨기지 않고 다시 시도할 수 있다', async ({
  page,
  request,
}) => {
  await resetState(request)
  // 다른 테스트가 실제 센서로 남긴 알림이 있을 수 있어, 비어 있는 것이 확실한 종류(연결 복구)로 좁혀 본다.
  await page.goto('/notifications?type=SENSOR_RESTORED')
  await expect(page.getByText('조건에 맞는 알림이 없습니다')).toBeVisible()
  await page.getByRole('button', { name: '조건 초기화' }).click()
  await expect(page).toHaveURL(/\/notifications$/)

  await page.route('**/api/alerts?**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: '알림을 읽는 중 문제가 생겼습니다.' },
      }),
    }),
  )
  await page.goto('/notifications?view=important')
  await expect(page.getByText('알림을 불러오지 못했습니다')).toBeVisible()
  await expect(page.getByText('알림을 읽는 중 문제가 생겼습니다.')).toBeVisible()
  await expect(page.getByText('중요 알림이 없습니다')).toHaveCount(0) // 실패를 "없음"으로 보이지 않는다
  await page.unroute('**/api/alerts?**')
  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('중요 알림이 없습니다')).toBeVisible()
})

test('좁은 화면: 가로로 넘치지 않고 읽음·관련 기록 버튼이 눌리기 쉽다', async ({
  page,
  request,
}) => {
  await seed(page, request)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  const buttons = list(page).first().getByRole('button')
  for (const box of await buttons.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  )) {
    expect(box).toBeGreaterThanOrEqual(44)
  }
})
