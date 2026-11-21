import { expect, test, type Page } from '@playwright/test'
import { ensureSimulatedSensors, resetState } from '../support/api'

/**
 * 연결 오류가 쉬운 한국어로 안내되는지, 서버 데이터가 새로고침 뒤에도 유지되는지 실제 브라우저로 확인한다.
 * (서버가 꺼진 것·네트워크 끊김·잘못된 응답은 브라우저 요청을 가로채 흉내 낸다. 응답 시간 초과는 단위 테스트가 확인한다.)
 */

test.beforeEach(async ({ request }) => {
  await resetState(request)
  await ensureSimulatedSensors(request)
})

const side = (page: Page) => page.getByRole('navigation', { name: '주요 메뉴' })

test('서버에 연결할 수 없으면 원인과 해 볼 일을 알리고, 서버가 돌아오면 다시 시도로 불러온다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '하단 메뉴 구조가 달라 데스크톱에서 확인한다.')
  // 센서 목록 요청만 서버에 닿지 못하게 한다. (이미 받아 둔 값이 있으면 다시 읽지 않으므로 처음부터 연다)
  await page.route('**/api/sensors', (route) => route.abort('connectionrefused'))
  await page.goto('/sensors')
  await expect(
    page.getByText('서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인해 주세요.').first(),
  ).toBeVisible({
    timeout: 20_000,
  })
  await expect(
    page.getByText(/서버가 실행 중인지, 주소가 맞는지 확인해 주세요/).first(),
  ).toBeVisible()

  await page.unroute('**/api/sensors')
  await page.getByRole('button', { name: '다시 시도' }).first().click()
  await expect(page.getByText('시뮬레이션 현관').first()).toBeVisible()
})

test('서버가 약속과 다른 응답을 주면 성공처럼 보이지 않고 버전 확인을 안내한다', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '하단 메뉴 구조가 달라 데스크톱에서 확인한다.')
  await page.route('**/api/sensors', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"unexpected":true}' }),
  )
  await page.goto('/sensors')
  await expect(page.getByText('서버 응답이 예상한 형식과 다릅니다').first()).toBeVisible()
  await expect(page.getByText(/서로 다른 버전일 수 있습니다/).first()).toBeVisible()
  await expect(page.getByText('시뮬레이션 현관')).toHaveCount(0)
})

test('인터넷이 끊기면 서버 문제가 아니라 연결 문제라고 알린다', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '하단 메뉴 구조가 달라 데스크톱에서 확인한다.')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByText('인터넷 연결이 끊겨 있습니다').first()).toBeVisible({
    timeout: 20_000,
  })
  await context.setOffline(false)
})

test('화면을 쓰는 중 로그인이 만료되면 로그인 화면으로 보내고 만료되었다고 알린다', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '하단 메뉴 구조가 달라 데스크톱에서 확인한다.')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  await context.clearCookies() // 서버에서 세션이 사라진 것과 같다.
  await side(page).getByRole('link', { name: '알림 센터', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('로그인이 만료되었습니다', { exact: true })).toBeVisible()
  await expect(page.getByText(/다시 로그인해 주세요/)).toBeVisible()
})

test('서버에 저장한 센서 이름은 새로고침해도 유지된다 (서버 데이터를 보여 주는지 확인)', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '하단 메뉴 구조가 달라 데스크톱에서 확인한다.')
  const sensors = (await (await request.get('/api/sensors')).json()) as {
    sensors: { id: string }[]
  }
  const id = sensors.sensors[0]!.id
  const name = `새로고침 확인 ${Date.now() % 100000}`
  const patched = await request.patch(`/api/sensors/${id}`, { data: { name } })
  expect(patched.ok()).toBe(true)
  await page.goto('/sensors')
  await expect(page.getByText(name).first()).toBeVisible()
  await page.reload()
  await expect(page.getByText(name).first()).toBeVisible()
})
