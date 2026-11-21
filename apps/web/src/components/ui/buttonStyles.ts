import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-ink-inverse enabled:hover:bg-brand-strong',
  secondary: 'border border-line-strong bg-surface text-ink enabled:hover:bg-brand-soft',
  ghost: 'text-brand-strong enabled:hover:bg-brand-soft',
  danger: 'bg-status-danger text-ink-inverse enabled:hover:bg-status-danger-strong',
}

/** 높이는 모두 터치하기 쉬운 44px 이상이다. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-body-sm',
  md: 'min-h-12 px-5 text-body',
  lg: 'min-h-14 px-6 text-body-lg',
}

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: 'size-11',
  md: 'size-12',
  lg: 'size-14',
}

interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** 아이콘만 있는 정사각형 버튼 */
  iconOnly?: boolean
}

/**
 * 버튼 모양의 className. 링크(<Link>·<a>)를 버튼처럼 보이게 할 때도 이것을 쓴다.
 * (버튼과 링크가 같은 모양을 쓰므로 스타일이 중복되지 않는다)
 */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
}: ButtonStyleOptions = {}): string {
  return cn(
    BASE,
    VARIANTS[variant],
    iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size],
    fullWidth && 'w-full',
  )
}
