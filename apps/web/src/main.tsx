import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { loadApiRuntime } from '@/services/api/runtime'
import { env } from '@/lib/env'
import '@/styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root 요소를 찾을 수 없습니다.')
const root = createRoot(container)

// Mock 구현은 개발 서버에서만 불러온다. 운영 빌드에서는 이 식이 null 이 되어 Mock 코드가 번들에서 빠진다.
const loadMock = import.meta.env.DEV ? () => import('@/services/api/mock') : null

loadApiRuntime(import.meta.env.VITE_MOCK_FEATURES, loadMock, env.appMode)
  .then((runtime) => {
    root.render(
      <StrictMode>
        <App runtime={runtime} />
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    // 설정 오류는 빈 화면으로 두지 않고 원인을 그대로 보여 준다.
    const message = error instanceof Error ? error.message : String(error)
    container.textContent = `앱을 시작하지 못했습니다. ${message}`
    container.setAttribute('role', 'alert')
    container.style.padding = '1.5rem'
  })
