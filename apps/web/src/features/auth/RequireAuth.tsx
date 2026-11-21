import { Navigate, Outlet, useLocation } from 'react-router'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useSession } from '@/hooks/useAuth'
import { RealtimeConnector } from './RealtimeConnector'
import { Button } from '@/components/ui/Button'

/**
 * 로그인한 보호자만 들어갈 수 있는 영역.
 * - 로그인 상태를 확인하는 동안: 안내 표시
 * - 확인 자체에 실패(서버 오류 등): 로그아웃된 것처럼 로그인 화면으로 보내지 않고, 실패를 알리고 다시 시도하게 한다
 * - 로그인되어 있지 않음(401): 로그인 화면으로 이동
 */
export function RequireAuth() {
  const { data, isPending, error, refetch } = useSession()
  const location = useLocation()

  if (data === undefined) {
    if (isPending) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-6">
          <StatusBadge tone="checking">로그인 상태를 확인하는 중</StatusBadge>
        </div>
      )
    }
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
        <Card>
          <div className="mb-3">
            <StatusBadge tone="danger">로그인 상태를 확인하지 못했습니다</StatusBadge>
          </div>
          <p role="alert" className="text-ink-muted">
            {error?.message}
          </p>
          <Button className="mt-4" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </Card>
      </div>
    )
  }

  if (data === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return (
    <>
      <RealtimeConnector />
      <Outlet />
    </>
  )
}
