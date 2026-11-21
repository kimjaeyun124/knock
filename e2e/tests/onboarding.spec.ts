import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { clearSimulated, resetState, sendMotion } from '../support/api'

/**
 * 초기 설정(온보딩) 6단계를 실제 브라우저·서버로 처음부터 끝까지 확인한다.
 * 서버 상태를 모든 테스트가 공유하므로, 이 파일은 바꾼 설정(알림 수신·호칭)을 마지막에 되돌린다.
 * (초기 설정 "완료"는 되돌릴 수 없으므로, 어느 단계에서 시작해도 끝까지 갈 수 있게 썼다.)
 */

interface HouseholdBody {
  household: {
    recipientAlias: string | null
    recipientMemo: string | null
    onboardingStep: number
    setupCompleted: boolean
  }
}

const getHousehold = async (api: APIRequestContext) =>
  ((await (await api.get('/api/household')).json()) as HouseholdBody).household

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
    violations.map((v) => `${v.id}: ${v.help}`),
    label,
  ).toEqual([])
}

const stepLabel = (page: Page, text: string) => page.getByText(text, { exact: true })

test.describe('초기 설정 6단계', () => {
  let originalAlias = '어르신'

  test.beforeAll(async ({ request }) => {
    originalAlias = (await getHousehold(request)).recipientAlias ?? '어르신'
  })

  test.afterAll(async ({ request }) => {
    // 다른 테스트가 기본 설정(모든 알림 받음, 기본 호칭)을 기대한다.
    const restored = await request.put('/api/settings/alerts', { data: ALL_ON })
    expect(restored.ok(), await restored.text()).toBe(true)
    await request.put('/api/household', {
      data: { recipientAlias: originalAlias, recipientMemo: '' },
    })
    await resetState(request)
  })

  test('처음부터 끝까지: 소개 → 보호 대상 → 센서 → 시간 → 알림 → 확인 → 대시보드', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '전체 진행은 데스크톱에서 한 번만 확인한다.')
    test.setTimeout(120_000)
    await clearSimulated(request)
    const reachedBefore = (await getHousehold(request)).onboardingStep

    // ── 1단계: 서비스 소개 ───────────────────────────────
    await page.goto('/onboarding?step=1')
    await expect(stepLabel(page, '1/6 단계 · 서비스 소개')).toBeVisible()
    await expect(
      page.getByText(/넘어짐이나 외출 같은 상황을 판단하거나 막아 주지 않습니다/),
    ).toBeVisible()
    await expectNoViolations(page, '1단계')
    const understood = page.getByRole('checkbox', { name: /한계를 이해했습니다/ })
    if (!(await understood.isChecked())) {
      await expect(page.getByRole('button', { name: '시작하기' })).toBeDisabled()
      await understood.check()
    }
    await page.getByRole('button', { name: '시작하기' }).click()

    // ── 2단계: 보호 대상 ─────────────────────────────────
    await expect(stepLabel(page, '2/6 단계 · 보호 대상')).toBeVisible()
    await expect(page.getByText(/실명, 주민등록번호, 전화번호, 주소/)).toBeVisible()
    await expectNoViolations(page, '2단계')
    const alias = page.getByLabel('표시 이름 (필수)')
    await alias.fill('')
    await page.getByRole('button', { name: '다음' }).click()
    await expect(page.getByText('호칭을 입력해 주세요.')).toBeVisible()
    await expect(stepLabel(page, '2/6 단계 · 보호 대상')).toBeVisible()
    await alias.fill('할머니')
    await page.getByLabel(/^메모 \(선택\)/).fill('밤에 화장실에 가심')

    // 이전으로 갔다 와도 입력값이 남는다.
    await page.getByRole('button', { name: '이전' }).click()
    await expect(stepLabel(page, '1/6 단계 · 서비스 소개')).toBeVisible()
    await page.getByRole('button', { name: '시작하기' }).click()
    await expect(alias).toHaveValue('할머니')
    await page.getByRole('button', { name: '다음' }).click()

    // ── 3단계: 센서 (시뮬레이션) ─────────────────────────
    await expect(stepLabel(page, '3/6 단계 · 센서')).toBeVisible()
    await page.getByRole('button', { name: '센서 추가' }).click()
    await expect(page.getByText('센서 유형을 고르세요')).toBeVisible()
    await page.getByRole('button', { name: '다음' }).click()
    await page.getByRole('radio', { name: /시뮬레이션 센서/ }).check()
    await page.getByRole('button', { name: '다음' }).click()
    await page.getByRole('button', { name: '시뮬레이션 센서 만들기' }).click()
    await expect(page.getByText('시뮬레이션 센서 3개가 준비되었습니다')).toBeVisible()
    await page.getByRole('button', { name: '등록 마치기' }).click()
    // 시뮬레이션은 실제 장치가 아니라고 목록에도 밝힌다. (시뮬레이터가 첫 신호를 보내므로 연결됨으로 표시된다)
    await expect(page.getByText(/시뮬레이션 센서\(실제 장치 아님\)/).first()).toBeVisible()
    await expect(page.getByText('시뮬레이션', { exact: true }).first()).toBeVisible()
    await expectNoViolations(page, '3단계')

    await sendMotion(request, 'BED_SIDE')
    await page.getByRole('button', { name: '연결 상태 다시 확인' }).click()
    await expect(page.getByText(/마지막 신호:/).first()).toBeVisible()
    await page.getByRole('button', { name: '다음' }).click()

    // ── 도중에 나갔다 돌아오기: 저장된 단계에서 이어 한다 ───────
    await expect(stepLabel(page, '4/6 단계 · 모니터링 시간')).toBeVisible()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    await page.goto('/onboarding')
    await expect(page.getByText(/^[4-6]\/6 단계 ·/)).toBeVisible()
    if (reachedBefore === 1) {
      await expect(stepLabel(page, '4/6 단계 · 모니터링 시간')).toBeVisible()
      await expect(page.getByText('이전에 하던 곳에서 이어서 합니다')).toBeVisible()
    }
    await page.goto('/onboarding?step=4')

    // ── 4단계: 모니터링 시간 ─────────────────────────────
    await expect(stepLabel(page, '4/6 단계 · 모니터링 시간')).toBeVisible()
    await expectNoViolations(page, '4단계')
    await page.getByLabel('시작 시각').fill('22:00')
    await page.getByLabel('종료 시각').fill('06:00')
    await expect(page.getByText(/오후 10:00부터 다음 날 오전 6:00까지, 8시간 동안/)).toBeVisible()
    await page.getByLabel('종료 시각').fill('22:00')
    await page.getByRole('button', { name: '다음' }).click()
    await expect(page.getByText('시작과 종료 시각은 달라야 합니다.')).toBeVisible()
    await page.getByRole('button', { name: '제안한 시간으로 되돌리기' }).click()
    await page.getByLabel('시작 시각').fill('21:00')
    await page.getByRole('button', { name: '다음' }).click()

    // ── 5단계: 알림 ──────────────────────────────────────
    await expect(stepLabel(page, '5/6 단계 · 알림')).toBeVisible()
    await expect(page.getByText(/서버에는 브라우저 푸시가 설정되어 있지 않습니다/)).toBeVisible()
    await expectNoViolations(page, '5단계')
    await page.getByRole('switch', { name: /^현관 근처 움직임/ }).click()
    await page.getByRole('button', { name: '다음' }).click()

    // ── 6단계: 확인 ──────────────────────────────────────
    await expect(stepLabel(page, '6/6 단계 · 확인')).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByText('할머니', { exact: true })).toBeVisible()
    await expect(main.getByText('밤에 화장실에 가심')).toBeVisible()
    await expect(main.getByText(/오후 9:00 ~ 다음 날 오전 6:00 \(9시간\)/)).toBeVisible()
    await expect(
      main.getByText('현관 근처 움직임').locator('xpath=following-sibling::span'),
    ).toHaveText('받지 않음')
    // 시뮬레이션 센서만 있으므로 실제 감지가 아니라고 알린다.
    await expect(main.getByText(/시뮬레이션 센서만 있습니다/)).toBeVisible()
    await expectNoViolations(page, '6단계')

    // 서버에 저장되어 있다.
    const alerts = (await (await request.get('/api/settings/alerts')).json()) as Record<
      string,
      unknown
    >
    expect(alerts.entranceApproach).toBe(false)
    const detection = (await (await request.get('/api/settings/detection')).json()) as Record<
      string,
      unknown
    >
    expect(detection).toMatchObject({ nightStart: '21:00', nightEnd: '06:00' })

    await page.getByRole('button', { name: '설정 완료' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
    await expect(page.getByText('초기 설정을 마치지 않았습니다')).toHaveCount(0)
    expect((await getHousehold(request)).setupCompleted).toBe(true)

    // 이미 마친 사용자는 설정을 다시 하라고 요구받지 않는다.
    await page.goto('/onboarding')
    await expect(page.getByText('초기 설정을 이미 마쳤습니다')).toBeVisible()
    await expect(page.getByText(/^\d\/6 단계 ·/)).toHaveCount(0)
    await page.getByRole('link', { name: '대시보드로 가기' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('설정 화면에서도 받을 알림을 바꿀 수 있고, 바꾼 값이 서버에 저장된다', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '데스크톱에서만 확인한다.')
    const put = await request.put('/api/settings/alerts', { data: ALL_ON })
    expect(put.ok(), await put.text()).toBe(true)
    await page.goto('/settings')
    const section = page
      .getByRole('heading', { name: '센서 장애·배터리 알림' })
      .locator('xpath=ancestor::section[1]')
    const row = section.getByRole('switch', { name: /^센서 장애 알림/ })
    await expect(row).toBeChecked()
    await row.click()
    await section.getByRole('button', { name: '저장' }).click()
    await expect(section.getByText(/저장했습니다\./)).toBeVisible()
    const saved = (await (await request.get('/api/settings/alerts')).json()) as Record<
      string,
      unknown
    >
    expect(saved.sensorIssues).toBe(false)
  })

  test('모든 단계가 가로로 넘치지 않고, 조작 요소가 터치하기 쉬우며, 접근성 위반이 없다', async ({
    page,
    request,
  }) => {
    // 모든 단계를 볼 수 있도록 도달 단계를 올린다. (설정 완료로 기록되지는 않는다)
    const put = await request.put('/api/household', { data: { onboardingStep: 6 } })
    expect(put.ok(), await put.text()).toBe(true)
    for (let step = 1; step <= 6; step += 1) {
      await page.goto(`/onboarding?step=${step}`)
      await expect(page.getByText(new RegExp(`^${step}/6 단계 ·`))).toBeVisible()
      await expect(page.getByText('불러오는 중')).toHaveCount(0)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${step}단계 가로 넘침`).toBeLessThanOrEqual(0)
      const small = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'main button, main a, main input, main select, main textarea, main [role="switch"]',
          ),
        )
          .filter((el) => {
            const rect = el.getBoundingClientRect()
            const type = el instanceof HTMLInputElement ? el.type : ''
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              rect.height < 44 &&
              !el.closest('.sr-only') &&
              !['radio', 'checkbox'].includes(type) &&
              getComputedStyle(el).position !== 'absolute'
            )
          })
          .map(
            (el) =>
              `${el.tagName}:${(el.textContent ?? '').trim().slice(0, 20)}:${Math.round(el.getBoundingClientRect().height)}`,
          ),
      )
      expect(small, `${step}단계 작은 조작 요소`).toEqual([])
      await expectNoViolations(page, `${step}단계 접근성`)
    }
  })
})
