import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { errorResponse, jsonResponse, loggedInHandlers, renderApp, stubApi } from '@/test/helpers'

async function fill(current: string, next: string, again: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('현재 비밀번호'), current)
  await user.type(screen.getByLabelText('새 비밀번호'), next)
  await user.type(screen.getByLabelText('새 비밀번호 확인'), again)
  await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))
}

describe('비밀번호 변경 화면', () => {
  it('바꾸면 서버에 보내고, 다른 기기가 로그아웃되었음을 알리고, 입력을 비운다', async () => {
    let sent: unknown = null
    stubApi({
      ...loggedInHandlers(),
      'POST /api/auth/password': (req) => {
        sent = req.body
        return jsonResponse({ ok: true, signedOutOtherSessions: 2 })
      },
    })
    renderApp('/settings/password')
    await fill('old-password-123', 'new-password-456', 'new-password-456')
    expect(await screen.findByText('비밀번호를 바꿨습니다')).toBeInTheDocument()
    expect(screen.getByText(/다른 기기 2곳은 로그아웃/)).toBeInTheDocument()
    expect(sent).toEqual({ currentPassword: 'old-password-123', newPassword: 'new-password-456' })
    expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('')
  })

  it('서버에 보내기 전에 짧은 비밀번호·확인 불일치를 알린다', async () => {
    let called = false
    stubApi({
      ...loggedInHandlers(),
      'POST /api/auth/password': () => {
        called = true
        return jsonResponse({ ok: true, signedOutOtherSessions: 0 })
      },
    })
    renderApp('/settings/password')
    await fill('old-password-123', 'short', 'short')
    expect(await screen.findByRole('alert')).toHaveTextContent('12자 이상')
    expect(called).toBe(false)
  })

  it('현재 비밀번호가 틀리면 서버의 안내를 보여 주고 입력을 지우지 않는다', async () => {
    stubApi({
      ...loggedInHandlers(),
      'POST /api/auth/password': () =>
        errorResponse(400, 'BAD_REQUEST', '현재 비밀번호가 올바르지 않습니다.'),
    })
    renderApp('/settings/password')
    await fill('wrong-password-1', 'new-password-456', 'new-password-456')
    expect(await screen.findByRole('alert')).toHaveTextContent('현재 비밀번호가 올바르지 않습니다')
    await waitFor(() =>
      expect(screen.getByLabelText('새 비밀번호')).toHaveValue('new-password-456'),
    )
  })
})
