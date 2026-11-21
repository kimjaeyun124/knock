import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'

interface ErrorStateProps {
  title?: string
  /** 무엇이 잘못됐는지 사람이 읽을 수 있는 설명 */
  message?: string | null
  /** 문의할 때 알려 줄 식별 정보(요청 번호 등) */
  detail?: string | null
  onRetry?: () => void
  retryLabel?: string
  /** inline: 내용 자리에 그대로, panel: 테두리 있는 상자 */
  variant?: 'inline' | 'panel'
  className?: string
}

/** 불러오기·저장에 실패했음을 숨기지 않고 글자로 알리고, 다시 시도할 수 있게 한다. */
export function ErrorState({
  title = '불러오지 못했습니다',
  message,
  detail,
  onRetry,
  retryLabel = '다시 시도',
  variant = 'inline',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'space-y-3',
        variant === 'panel'
          ? 'rounded-card border-2 border-status-danger bg-status-danger-soft p-4'
          : 'py-2',
        className,
      )}
    >
      <StatusBadge tone="danger" icon={CircleAlert}>
        {title}
      </StatusBadge>
      {message ? <p className="text-body text-ink">{message}</p> : null}
      {detail ? <p className="text-body-sm text-ink">{detail}</p> : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
