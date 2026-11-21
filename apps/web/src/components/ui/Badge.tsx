import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'neutral' | 'brand' | 'outline'
type BadgeSize = 'sm' | 'md'

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-status-muted-soft text-ink',
  brand: 'bg-brand-soft text-brand-strong',
  outline: 'border border-line-strong bg-surface text-ink',
}

const SIZES: Record<BadgeSize, string> = {
  sm: 'min-h-6 px-2 text-caption',
  md: 'min-h-8 px-3 text-label',
}

interface BadgeProps extends ComponentProps<'span'> {
  variant?: BadgeVariant
  size?: BadgeSize
}

/** 상태가 아닌 분류·꼬리표(예: "시뮬레이션", 구역 이름). 상태는 StatusBadge 를 쓴다. */
export function Badge({ variant = 'neutral', size = 'md', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  )
}
