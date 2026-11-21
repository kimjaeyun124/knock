import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { ONBOARDING_STEPS } from './steps'

/**
 * 현재 단계 표시. 진행 막대 + "3/6 단계 · 센서" 글자 + 단계 목록.
 * 단계가 바뀌면 안내 글자로 초점을 옮겨 스크린리더가 새 단계를 읽게 한다.
 */
export function StepIndicator({ current }: { current: number }) {
  const label = useRef<HTMLParagraphElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    label.current?.focus()
  }, [current])

  const total = ONBOARDING_STEPS.length
  return (
    <nav aria-label="초기 설정 단계" className="space-y-3">
      <p
        ref={label}
        tabIndex={-1}
        aria-live="polite"
        className="text-body font-semibold text-ink-muted outline-none"
      >
        {current}/{total} 단계 · {ONBOARDING_STEPS[current - 1]?.label}
      </p>
      <div
        role="progressbar"
        aria-label="초기 설정 진행"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${total}단계 중 ${current}단계`}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>
      <ol className="hidden flex-wrap gap-2 sm:flex">
        {ONBOARDING_STEPS.map((step, index) => {
          const number = index + 1
          const done = number < current
          const active = number === current
          return (
            <li
              key={step.id}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-body-sm',
                active && 'border-brand bg-brand-soft font-bold text-brand-strong',
                done && 'border-status-ok bg-status-ok-soft text-status-ok-strong',
                !active && !done && 'border-line text-ink-muted',
              )}
            >
              {done ? <Check aria-hidden="true" className="size-4" /> : <span>{number}.</span>}
              {step.label}
              {done ? <span className="sr-only"> (지나온 단계)</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
