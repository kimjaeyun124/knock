import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PageHeaderProps {
  /** 화면 제목 (h1). 화면마다 하나만 둔다. */
  title: string
  description?: ReactNode
  /** 제목 옆·아래에 두는 상태 배지 같은 덧붙임 */
  meta?: ReactNode
  /** 오른쪽(좁은 화면에서는 아래)에 두는 주요 버튼 */
  actions?: ReactNode
  className?: string
}

/** 화면 맨 위의 제목 영역 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 space-y-2">
        <h1 className="text-h1">{title}</h1>
        {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        {description ? <p className="max-w-prose text-body text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
