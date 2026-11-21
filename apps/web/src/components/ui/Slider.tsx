import * as RadixSlider from '@radix-ui/react-slider'
import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SliderProps {
  label: string
  hint?: ReactNode
  min: number
  max: number
  step?: number
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  /** 값을 사람이 읽는 글자로 바꾼다. (예: 30 → "30분") 화면과 스크린리더가 같은 글자를 쓴다. */
  formatValue?: (value: number) => string
  disabled?: boolean
  name?: string
  className?: string
}

/**
 * 값 하나를 고르는 슬라이더. 현재 값을 글자로 크게 보여 주고, 키보드(←/→, Home/End, PageUp/PageDown)로도 조절된다.
 * 정확한 값이 중요한 곳에는 숫자 입력 칸(TextField)을 함께 둔다.
 */
export function Slider({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  defaultValue,
  onValueChange,
  formatValue = String,
  disabled,
  name,
  className,
}: SliderProps) {
  const id = useId()
  const [inner, setInner] = useState(defaultValue ?? min)
  const current = value ?? inner
  const text = formatValue(current)
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span id={`${id}-label`} className="text-body font-semibold">
          {label}
        </span>
        {/* 스크린리더는 슬라이더의 aria-valuetext 로 읽으므로 같은 글자를 두 번 읽지 않게 숨긴다. */}
        <span aria-hidden="true" className="text-body-lg font-bold text-brand-strong tabular-nums">
          {text}
        </span>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      <RadixSlider.Root
        name={name}
        min={min}
        max={max}
        step={step}
        value={[current]}
        disabled={disabled}
        onValueChange={([next]) => {
          if (next === undefined) return
          setInner(next)
          onValueChange?.(next)
        }}
        className="relative flex h-11 w-full touch-none items-center select-none data-[disabled]:opacity-60"
      >
        <RadixSlider.Track className="relative h-2.5 grow rounded-full border border-line-strong bg-line">
          <RadixSlider.Range className="absolute h-full rounded-full bg-brand" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          id={id}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-valuetext={text}
          className="block size-7 rounded-full border-2 border-brand bg-surface shadow-overlay"
        />
      </RadixSlider.Root>
    </div>
  )
}
