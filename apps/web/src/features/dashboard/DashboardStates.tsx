import { Link } from 'react-router'
import { PATHS } from '@/app/paths'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { ApiError } from '@/services/apiClient'
import { WifiOff } from 'lucide-react'

/** Loading: 불러오는 동안 자리를 잡아 두고, 무엇을 기다리는지 글자로 알린다. */
export function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div role="status">
        <StatusBadge tone="checking">대시보드를 불러오는 중</StatusBadge>
      </div>
      <Skeleton shape="block" className="h-48" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index}>
            <SkeletonText lines={4} />
          </Card>
        ))}
      </div>
    </div>
  )
}

/** Error: 처음부터 불러오지 못했을 때. 원인과 다시 시도 방법을 알린다. */
export function DashboardError({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const requestId = error instanceof ApiError ? error.requestId : null
  return (
    <ErrorState
      variant="panel"
      title="대시보드를 불러오지 못했습니다"
      message={error?.message ?? '잠시 후 다시 시도해 주세요.'}
      detail={requestId ? `문의할 때 알려 주세요: ${requestId}` : null}
      onRetry={onRetry}
    />
  )
}

/**
 * Offline: 연결이 끊겨 있고 받아 둔 정보도 없을 때.
 * 비어 있는 화면을 "기록 없음"으로 오해하지 않도록, 연결 문제라고 분명히 알린다.
 */
export function DashboardOffline({ detail }: { detail: string }) {
  return (
    <EmptyState
      size="comfortable"
      icon={WifiOff}
      title="연결이 끊겨 대시보드를 볼 수 없습니다"
      description={`${detail} 연결이 돌아오면 자동으로 다시 불러옵니다. 걱정되시면 어르신께 직접 연락하거나 확인해 주세요.`}
    />
  )
}

/** Empty: 등록된 센서가 하나도 없을 때. 오류가 아니라 "아직 시작하지 않은" 상태다. */
export function DashboardEmpty() {
  return (
    <Card>
      <EmptyState
        size="comfortable"
        title="아직 등록된 센서가 없습니다"
        description="센서를 등록하면 움직임 신호와 연결 상태가 여기에 표시됩니다. 센서가 없는 동안에는 움직임을 확인할 수 없습니다."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to={PATHS.sensorNew} className={buttonStyles()}>
              센서 등록
            </Link>
            <Link to={PATHS.onboarding} className={buttonStyles({ variant: 'secondary' })}>
              초기 설정 하기
            </Link>
          </div>
        }
      />
    </Card>
  )
}
