import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resetState } from '../support/api'

/**
 * 시뮬레이터 화면으로 전체 흐름을 시연한다:
 *   시뮬레이터 → 수집 API → 검증 → DB 저장 → 규칙 → 알림 → Socket.IO → 다른 화면이 새로고침 없이 갱신
 * 화면의 버튼은 서버 API 를 호출할 뿐이고, 결과(저장됨·중복·새 알림)는 서버의 응답이다.
 */
test.beforeEach(async ({ request }) => {
  await resetState(request)
})

const resultCard = (page: Page) =>
  page
    .getByRole('heading', { name: '전송 결과', exact: true })
    .locator('xpath=ancestor::section[1]')
/** 구역 한 칸. (구역 이름 + "움직임 보내기" 버튼이 있는 목록 항목) */
const zoneCard = (page: Page, zone: string) =>
  page
    .getByRole('listitem')
    .filter({ hasText: zone })
    .filter({ has: page.getByRole('button', { name: '움직임 보내기' }) })

test('센서 만들기 → 중복 전송 → 알림 생성 → 다른 화면이 새로고침 없이 갱신된다', async ({
  page,
  context,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  test.setTimeout(90_000)

  // 대시보드를 따로 열어 둔다. (Socket.IO 로 갱신되는지 보려는 것)
  const dashboard = await context.newPage()
  await dashboard.goto('/')
  await expect(dashboard.getByRole('heading', { name: '대시보드' })).toBeVisible()

  await page.goto('/dev/simulator')
  await expect(page.getByText('시뮬레이션입니다. 실제 센서가 아닙니다')).toBeVisible()
  await page.getByRole('button', { name: '시뮬레이션 센서 만들기' }).click()
  await expect(page.getByRole('button', { name: '현관 센서 연결 해제' })).toBeVisible()

  // 이벤트 유형: 중복 전송. 같은 이벤트를 두 번 보낸다.
  await page.getByLabel('전송 방식').selectOption('duplicate')
  await zoneCard(page, '현관').getByRole('button', { name: '움직임 보내기' }).click()
  const result = resultCard(page)
  await expect(result.getByText('서버가 처리했습니다')).toBeVisible()
  await expect(result.getByText('저장됨')).toBeVisible()
  await expect(result.getByText('중복이라 저장하지 않음')).toBeVisible()
  await expect(result.getByText(/현관 근처 움직임/)).toBeVisible() // 새로 만들어진 알림

  // 서버에는 한 건만 저장되어 있다.
  const events = (await (await request.get('/api/events?zone=ENTRANCE')).json()) as {
    events: { origin: string }[]
  }
  expect(events.events).toHaveLength(1)
  expect(events.events[0]?.origin).toBe('SIMULATED')

  // 다른 화면은 새로고침 없이 알림을 보여 준다.
  await expect(dashboard.getByText(/현관 근처에서 움직임이 감지되었습니다/).first()).toBeVisible({
    timeout: 15_000,
  })

  // 최근 전송 기록에 남는다.
  const log = page
    .getByRole('heading', { name: '최근 전송 이벤트 기록' })
    .locator('xpath=ancestor::section[1]')
  await expect(log.getByText('중복 있음')).toBeVisible()
})

test('반복 전송과 배터리·연결 끊김 바로 확인·복구가 서버 처리를 거쳐 알림이 된다', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  test.setTimeout(90_000)
  await page.goto('/dev/simulator')
  await page.getByRole('button', { name: '시뮬레이션 센서 만들기' }).click()
  await expect(page.getByRole('button', { name: '침대 주변 센서 연결 해제' })).toBeVisible()

  // 반복 전송: 한 번에 4건이 모두 저장된다.
  await page.getByLabel('전송 방식').selectOption('burst')
  await page.getByLabel('건수 (2~20)').fill('4')
  await zoneCard(page, '이동 경로').getByRole('button', { name: '움직임 보내기' }).click()
  await expect(resultCard(page).getByText('저장됨')).toHaveCount(4)

  // 배터리 직접 입력: 위급 수준이면 배터리 알림이 생긴다.
  const bed = zoneCard(page, '침대 주변')
  await bed.getByLabel('배터리 직접 입력 (%)').fill('7')
  await bed.getByRole('button', { name: '침대 주변 배터리 값 적용' }).click()
  await expect(resultCard(page).getByText('배터리 7% 보고')).toBeVisible()
  await expect(resultCard(page).getByText(/센서 배터리 부족/)).toBeVisible()

  // 연결 끊김 바로 확인 → 서버의 연결 점검이 알림을 만든다.
  await bed.getByRole('button', { name: '침대 주변 끊김 바로 확인' }).click()
  await expect(resultCard(page).getByText(/센서 연결 끊김/)).toBeVisible()
  await page.goto('/notifications')
  await expect(
    page
      .getByRole('main')
      .getByText(/연결이 끊/)
      .first(),
  ).toBeVisible()
  const offline = (await (await request.get('/api/alerts?type=SENSOR_OFFLINE')).json()) as {
    alerts: { status: string; origin: string }[]
  }
  expect(offline.alerts[0]).toMatchObject({ origin: 'SIMULATED', status: 'OPEN' })

  // 연결 복구 → 끊김 알림이 자동 종료되고 복구 알림이 남는다.
  await page.goto('/dev/simulator')
  await zoneCard(page, '침대 주변').getByRole('button', { name: '연결 복구' }).click()
  await expect(resultCard(page).getByText(/센서 연결 복구/)).toBeVisible()
  await expect
    .poll(async () => {
      const body = (await (await request.get('/api/alerts?type=SENSOR_OFFLINE')).json()) as {
        alerts: { status: string }[]
      }
      return body.alerts[0]?.status
    })
    .toBe('RESOLVED')
})

test('연결 해제하면 시뮬레이션 센서가 사라지고, 화면에 접근성 위반이 없다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
  await page.goto('/dev/simulator')
  await page.getByRole('button', { name: '시뮬레이션 센서 만들기' }).click()
  await expect(page.getByRole('button', { name: '현관 센서 연결 해제' })).toBeVisible()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

  await page.getByRole('button', { name: '현관 센서 연결 해제' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '연결 해제' }).click()
  await expect(page.getByRole('button', { name: '현관 센서 만들기' })).toBeVisible()
})
