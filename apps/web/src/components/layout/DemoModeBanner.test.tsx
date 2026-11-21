import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loggedInHandlers, renderApp, stubApi, testRuntime } from '@/test/helpers'

describe('데모 모드 표시', () => {
  it('데모 모드에서는 모든 화면 위에 테스트 데이터임을 알리고, 샘플인 화면과 실제 서버인 기능을 구별한다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/', testRuntime({ mode: 'demo', mockFeatures: ['dashboard', 'sensors'] }))
    const banner = await screen.findByText(/데모 모드입니다/)
    expect(banner).toHaveTextContent('대시보드·센서 화면은 테스트 데이터(샘플)')
    expect(banner).toHaveTextContent('실제 센서·서버 데이터가 아닙니다')
    expect(banner).toHaveTextContent('로그인·알림·설정은 실제 서버')
  })

  it('api 모드에서는 보이지 않는다', async () => {
    stubApi(loggedInHandlers())
    renderApp('/')
    await screen.findByRole('heading', { name: '대시보드' })
    expect(screen.queryByText(/데모 모드입니다/)).not.toBeInTheDocument()
  })
})
