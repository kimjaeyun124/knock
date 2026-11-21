import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { buttonStyles, type ButtonSize, type ButtonVariant } from './buttonStyles'

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: LucideIcon
  /** 버튼이 하는 일. 글자가 없으므로 스크린리더가 읽을 이름이 반드시 필요하다. */
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
}

/** 아이콘만 있는 정사각형 버튼. 이름(label)이 필수라서 이름 없는 버튼을 만들 수 없다. */
export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(buttonStyles({ variant, size, iconOnly: true }), className)}
      {...rest}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
    </button>
  )
}
