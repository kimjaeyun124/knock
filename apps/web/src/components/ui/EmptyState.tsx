import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  /** 다음에 할 수 있는 일 (버튼·링크) */
  action?: ReactNode
  /** compact: 카드 안, comfortable: 화면 전체가 비었을 때 */
  size?: 'compact' | 'comfortable'
  className?: string
}

/** 데이터가 없다는 것도 사실대로 알린다. 오류와 구분되는 정상 상태다. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  size = 'compact',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 text-center',
        size === 'compact' ? 'py-6' : 'py-12',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('text-ink-muted', size === 'compact' ? 'size-8' : 'size-12')}
      />
      <p className={cn('font-semibold', size === 'compact' ? 'text-body' : 'text-h3')}>{title}</p>
      {description ? <p className="max-w-prose text-body text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
