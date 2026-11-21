import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { buttonStyles, type ButtonSize, type ButtonVariant } from './buttonStyles'

export type { ButtonSize, ButtonVariant } from './buttonStyles'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** 처리 중. 눌러도 동작하지 않고, 스크린리더에는 aria-busy 로 알린다. */
  loading?: boolean
  /** 처리 중에 보여 줄 글자 (예: "저장하는 중"). 없으면 원래 글자를 그대로 둔다. */
  loadingText?: string
  leadingIcon?: LucideIcon
  trailingIcon?: LucideIcon
}

/** 터치하기 쉬운 크기(높이 44px 이상)의 버튼 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading = false,
  loadingText,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  className,
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin" />
      ) : LeadingIcon ? (
        <LeadingIcon aria-hidden="true" className="size-5 shrink-0" />
      ) : null}
      {loading && loadingText ? loadingText : children}
      {!loading && TrailingIcon ? (
        <TrailingIcon aria-hidden="true" className="size-5 shrink-0" />
      ) : null}
    </button>
  )
}
