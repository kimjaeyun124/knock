import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE_STYLES, type StatusTone } from './tones'

export type { StatusTone } from './tones'

type StatusBadgeSize = 'sm' | 'md'

const SIZES: Record<StatusBadgeSize, { box: string; icon: string }> = {
  sm: { box: 'min-h-6 px-2 py-0.5 text-caption', icon: 'size-3.5' },
  md: { box: 'min-h-8 px-3 py-1 text-label', icon: 'size-4' },
}

interface StatusBadgeProps {
  tone: StatusTone
  size?: StatusBadgeSize
  /** 상태에 더 잘 맞는 아이콘이 있으면 지정한다. 없으면 색에 맞는 기본 아이콘을 쓴다. */
  icon?: LucideIcon
  className?: string
  children: ReactNode
}

/** 상태는 색뿐 아니라 아이콘과 글자로도 전달한다. */
export function StatusBadge({ tone, size = 'md', icon, className, children }: StatusBadgeProps) {
  const style = TONE_STYLES[tone]
  const Icon = icon ?? style.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        style.soft,
        style.text,
        SIZES[size].box,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('shrink-0', SIZES[size].icon, style.spin && 'animate-spin')}
      />
      <span>{children}</span>
    </span>
  )
}
