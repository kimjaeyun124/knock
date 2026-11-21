import { Info } from 'lucide-react'
import { ErrorState as ErrorStateView } from '@/components/ui/ErrorState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { describeApiError } from '@/lib/apiErrors'
import { ApiError } from '@/services/apiClient'

// 데이터가 없는 상태는 디자인 시스템의 EmptyState 를 그대로 쓴다.
export { EmptyState } from '@/components/ui/EmptyState'

export function LoadingState({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div role="status" className="py-6">
      <StatusBadge tone="checking">{label}</StatusBadge>
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  error: Error | null
  onRetry?: () => void
}

/** 불러오기에 실패했음을 숨기지 않고 알리고, 다시 시도할 수 있게 한다. (오류 → 화면 문구 변환만 맡는다) */
export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  const requestId = error instanceof ApiError ? error.requestId : null
  const text = error ? describeApiError(error) : null
  // 해 볼 일(연결 문제의 원인별 안내)과 문의용 요청 번호를 함께 보여 준다.
  const detail = [text?.hint, requestId ? `문의할 때 알려 주세요: ${requestId}` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <ErrorStateView
      {...(title ? { title } : {})}
      message={text?.message ?? null}
      detail={detail || null}
      {...(onRetry ? { onRetry } : {})}
    />
  )
}

/** 서버가 아직 제공하지 않는 기능. 오류가 아니라 "아직 없음"으로 알린다. */
export function NotImplementedState({ message }: { message?: string }) {
  return (
    <div role="status" className="space-y-2 py-2">
      <StatusBadge tone="muted" icon={Info}>
        아직 구현되지 않은 기능
      </StatusBadge>
      {message ? <p className="text-ink-muted">{message}</p> : null}
    </div>
  )
}
