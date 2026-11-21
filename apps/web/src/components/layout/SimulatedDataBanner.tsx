import { useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { Link } from 'react-router'
import { useApi } from '@/hooks/useApi'
import { useFeatures } from '@/hooks/useFeatures'
import { queryKeys } from '@/lib/queryKeys'

/**
 * 시연용 시뮬레이션 데이터가 이 가구에 있을 때 모든 화면 위에 알린다.
 * 시뮬레이터가 켜진 서버에서만 확인하며(운영에서는 시뮬레이터가 꺼져 있어 그리지 않음),
 * 확인하지 못하면 아무것도 그리지 않는다. (있다고도 없다고도 단정하지 않음)
 * 앞의 DemoModeBanner 는 화면이 "샘플 데이터"를 쓰는 경우이고, 이것은 서버에 저장된 "시뮬레이션 데이터"가 있는 경우다.
 */
export function SimulatedDataBanner() {
  const api = useApi()
  const features = useFeatures()
  const enabled = features.data?.simulatorEnabled === true
  const summary = useQuery({
    queryKey: queryKeys.dataSummary,
    queryFn: ({ signal }) => api.data.summary(signal),
    enabled,
    staleTime: 30_000,
  })
  if (!enabled || !summary.data) return null
  const { sensors, events, alerts } = summary.data.simulated
  if (sensors + events + alerts === 0) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-x-3 gap-y-1 bg-status-warn-soft px-4 py-2 text-body-sm font-semibold text-status-warn-strong"
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        시연용 시뮬레이션 데이터가 있습니다. 시뮬레이션 센서의 신호와 알림은 실제 센서나 실제 상황이
        아닙니다.
      </p>
      <Link
        to="/settings/data"
        className="inline-flex min-h-11 items-center underline underline-offset-2"
      >
        데이터 관리
      </Link>
    </div>
  )
}
