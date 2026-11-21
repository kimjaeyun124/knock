import { FlaskConical } from 'lucide-react'
import { useAppMode, useMockFeatures } from '@/hooks/useApi'
import type { ApiFeature } from '@/services/api/features'

const FEATURE_LABELS: Partial<Record<ApiFeature, string>> = {
  dashboard: '대시보드',
  sensors: '센서',
  timeline: '움직임 기록',
  integrations: '연동 현황',
}

/**
 * 데모 모드(테스트 데이터)임을 모든 화면 위에 분명히 알린다. 실제 서버 데이터와 섞여 보이지 않게,
 * 어떤 화면이 샘플이고 무엇이 실제 서버인지 함께 적는다. api 모드에서는 아무것도 그리지 않는다.
 */
export function DemoModeBanner() {
  const mode = useAppMode()
  const mocked = useMockFeatures()
  if (mode !== 'demo') return null
  const names = mocked.map((feature) => FEATURE_LABELS[feature] ?? feature).join('·')
  return (
    <div
      role="status"
      className="flex items-start gap-2 bg-status-warn-soft px-4 py-2 text-body-sm font-semibold text-status-warn-strong"
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        데모 모드입니다. {names ? `${names} 화면은 ` : ''}테스트 데이터(샘플)이며 실제 센서·서버
        데이터가 아닙니다. 로그인·알림·설정은 실제 서버를 씁니다.
      </p>
    </div>
  )
}
