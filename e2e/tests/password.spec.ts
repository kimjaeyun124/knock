import { expect, test } from '@playwright/test'

/**
 * 비밀번호 변경 화면 (실제 서버·브라우저). 서버의 계정을 바꾸지 않도록 **틀린 현재 비밀번호**로만 시험하고,
 * 성공 경로는 서버 시험(password.routes.test.ts)과 웹 단위 시험이 확인한다.
 */
test('설정 → 비밀번호 변경: 입력 검사와 서버 거부가 안내되고 로그인은 유지된다', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.getByRole('link', { name: /비밀번호 변경/ }).click()
  await expect(page.getByRole('heading', { name: '비밀번호 변경', exact: true })).toBeVisible()

  await page.getByLabel('현재 비밀번호').fill('definitely-not-it-1')
  await page.getByLabel('새 비밀번호', { exact: true }).fill('short')
  await page.getByLabel('새 비밀번호 확인').fill('short')
  await page.getByRole('button', { name: '비밀번호 바꾸기' }).click()
  await expect(page.getByRole('alert')).toContainText('12자 이상')

  await page.getByLabel('새 비밀번호', { exact: true }).fill('a-new-long-password-1')
  await page.getByLabel('새 비밀번호 확인').fill('a-new-long-password-1')
  await page.getByRole('button', { name: '비밀번호 바꾸기' }).click()
  await expect(page.getByRole('alert')).toContainText('현재 비밀번호가 올바르지 않습니다')

  // 현재 비밀번호가 틀려도 로그아웃되지 않는다(401 이 아니라 400).
  await expect(page.getByRole('heading', { name: '비밀번호 변경', exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
})
