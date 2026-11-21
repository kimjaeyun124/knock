import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { CONTROL_BASE, CONTROL_SIZES, type ControlSize } from './controlStyles'

interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
  size?: ControlSize
  /** 값이 잘못되었음. 오류 문구(Field 의 error)와 함께 쓴다. */
  invalid?: boolean
}

/** 이름표 없는 입력 칸. 보통은 이름표·도움말·오류 문구가 함께 있는 TextField 를 쓴다. */
export function Input({ size = 'md', invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, CONTROL_SIZES[size], className)}
      {...rest}
    />
  )
}
