import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { CONTROL_BASE, CONTROL_SIZES, type ControlSize } from './controlStyles'

interface SelectProps extends Omit<ComponentProps<'select'>, 'size'> {
  size?: ControlSize
  invalid?: boolean
}

/**
 * 브라우저 기본 선택 칸을 그대로 쓴다. (모바일의 큰 선택 창, 키보드·스크린리더 지원이 가장 확실하다)
 * 모양만 입력 칸과 맞춘다.
 */
export function Select({ size = 'md', invalid, className, children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(CONTROL_BASE, CONTROL_SIZES[size], 'appearance-none pr-10', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-muted"
      />
    </div>
  )
}
