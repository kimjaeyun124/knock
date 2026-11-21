import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE_STYLES, type StatusTone } from './tones'

type StatusIndicatorSize = 'sm' | 'md' | 'lg'

const SIZES: Record<StatusIndicatorSize, { disc: string; icon: string; label: string }> = {
  sm: { disc: 'size-8', icon: 'size-4', label: 'text-body-sm' },
  md: { disc: 'size-10', icon: 'size-5', label: 'text-body-lg' },
  lg: { disc: 'size-14', icon: 'size-8', label: 'text-h1' },
}

interface StatusIndicatorProps {
  tone: StatusTone
  /** 상태를 한 줄로 말하는 글자. 색이나 아이콘이 아니라 이 글자가 상태를 알려 준다. */
  label: ReactNode
  description?: ReactNode
  size?: StatusIndicatorSize
  icon?: LucideIcon
  /** 값이 바뀔 때 스크린리더가 읽어 주어야 하면 true (role="status") */
  live?: boolean
  className?: string
}

/** 화면의 "지금 상태"를 크게 보여 준다. 원 모양 아이콘 + 굵은 글자 + 보조 설명. */
export function StatusIndicator({
  tone,
  label,
  description,
  size = 'md',
  icon,
  live = false,
  className,
}: StatusIndicatorProps) {
  const style = TONE_STYLES[tone]
  const Icon = icon ?? style.icon
  const sizes = SIZES[size]
  return (
    <div role={live ? 'status' : undefined} className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center rounded-full',
          style.soft,
          style.fill,
          sizes.disc,
        )}
      >
        <Icon className={cn(sizes.icon, style.spin && 'animate-spin')} />
      </span>
      <div className="min-w-0">
        <p className={cn('font-bold', style.text, sizes.label)}>{label}</p>
        {description ? <p className="text-body-sm text-ink-muted">{description}</p> : null}
      </div>
    </div>
  )
}
