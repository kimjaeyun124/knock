import * as RadixSwitch from '@radix-ui/react-switch'
import { Check } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SwitchProps {
  /** 켜고 끄는 대상. 스위치만 덩그러니 두지 않도록 이름표를 반드시 둔다. */
  label: string
  description?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  name?: string
  className?: string
}

/**
 * 켜짐/꺼짐 스위치. 상태를 색뿐 아니라 "켜짐/꺼짐" 글자와 체크 모양으로도 알린다.
 * 이름표 줄 전체가 눌리고, 스위치 자체의 터치 영역은 44px 이상이다.
 */
export function Switch({
  label,
  description,
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled,
  name,
  className,
}: SwitchProps) {
  const id = useId()
  const [inner, setInner] = useState(defaultChecked)
  const isOn = checked ?? inner
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <label htmlFor={id} className={cn('min-w-0 flex-1', disabled ? '' : 'cursor-pointer')}>
        <span className="block text-body font-semibold">{label}</span>
        {description ? (
          <span id={`${id}-description`} className="block text-body-sm text-ink-muted">
            {description}
          </span>
        ) : null}
      </label>
      <span aria-hidden="true" className="w-12 text-right text-label text-ink">
        {isOn ? '켜짐' : '꺼짐'}
      </span>
      <RadixSwitch.Root
        id={id}
        name={name}
        checked={isOn}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
        onCheckedChange={(next) => {
          setInner(next)
          onCheckedChange?.(next)
        }}
        className="group flex h-11 w-14 shrink-0 items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-8 w-14 items-center rounded-full bg-line-strong p-1 transition-colors duration-150 group-data-[state=checked]:bg-brand">
          <RadixSwitch.Thumb className="grid size-6 place-items-center rounded-full bg-surface text-brand transition-transform duration-150 group-data-[state=checked]:translate-x-6">
            {isOn ? <Check aria-hidden="true" className="size-4" strokeWidth={3} /> : null}
          </RadixSwitch.Thumb>
        </span>
      </RadixSwitch.Root>
    </div>
  )
}
