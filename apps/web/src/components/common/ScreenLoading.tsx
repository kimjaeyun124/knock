import { StatusBadge } from '@/components/ui/StatusBadge'

/** 화면 코드를 처음 불러오는 동안 보여 주는 전체 화면 안내. (지연 로딩되는 첫 화면용) */
export function ScreenLoading() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center p-6">
      <StatusBadge tone="checking">화면을 불러오는 중</StatusBadge>
    </div>
  )
}
