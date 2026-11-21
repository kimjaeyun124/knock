import { useId, type ComponentProps, type ReactNode } from 'react'
import { Input } from './Input'
import { cn } from '@/lib/cn'
import { CONTROL_BASE } from './controlStyles'
import { Select } from './Select'

interface FieldChrome {
  label: string
  hint?: string
  error?: string | null | undefined
}

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-body font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        // 색뿐 아니라 글자로 무엇이 잘못됐는지 말한다.
        <p
          id={`${id}-error`}
          role="alert"
          className="text-body-sm font-semibold text-status-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, { hint, error }: FieldChrome): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

/** 이름표·도움말·오류 문구가 연결된 입력 칸 */
export function TextField({
  label,
  hint,
  error,
  ...input
}: FieldChrome & ComponentProps<typeof Input>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <Input
        id={id}
        invalid={Boolean(error)}
        aria-describedby={describedBy(id, { label, hint, error })}
        {...input}
      />
    </FieldShell>
  )
}

/** 이름표·도움말·오류 문구가 연결된 선택 칸 */
export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: FieldChrome & ComponentProps<typeof Select>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <Select
        id={id}
        invalid={Boolean(error)}
        aria-describedby={describedBy(id, { label, hint, error })}
        {...select}
      >
        {children}
      </Select>
    </FieldShell>
  )
}

/** 이름표·도움말·오류 문구가 연결된 여러 줄 입력 칸 */
export function TextAreaField({
  label,
  hint,
  error,
  className,
  ...area
}: FieldChrome & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={cn(CONTROL_BASE, 'min-h-28 py-2 text-body', className)}
        {...area}
      />
    </FieldShell>
  )
}
