import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE_STYLES, type StatusTone } from './tones'

/** 안내(info)·주의(warn)·위험(danger)·정상(ok) */
type CalloutTone = Extract<StatusTone, 'ok' | 'warn' | 'danger'> | 'info'

const TONE_FOR: Record<CalloutTone, StatusTone> = {
  info: 'muted',
  ok: 'ok',
  warn: 'warn',
  danger: 'danger',
}

/**
 * 꼭 읽어야 하는 안내. 색 + 아이콘(원 안) + 제목 글자로 전달한다.
 * 노크의 안내 상자: 테두리 없는 옅은 바탕(위험만 얇은 테두리), 아이콘은 흰 원 위에 둔다.
 */
export function Callout({
  tone = 'info',
  title,
  className,
  children,
}: {
  tone?: CalloutTone
  title: string
  className?: string
  children?: ReactNode
}) {
  const style = TONE_STYLES[TONE_FOR[tone]]
  const Icon = style.icon
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-card p-4 text-ink',
        // 위험만 테두리로 한 번 더 눈에 띄게 한다. (색 + 아이콘 + 제목 글자는 모든 단계에 있다)
        tone === 'danger' && 'border border-status-danger',
        style.soft,
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface">
        <Icon aria-hidden="true" className={cn('size-5', style.fill)} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="pt-1 font-bold">{title}</p>
        {children ? <div className="mt-2 space-y-1">{children}</div> : null}
      </div>
    </div>
  )
}
