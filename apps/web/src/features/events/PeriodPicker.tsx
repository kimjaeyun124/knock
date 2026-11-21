import { Button } from '@/components/ui/Button'
import { formatShortKey } from '@/lib/localTime'
import { PERIOD_LABELS, matchPreset, type EventFilters, type PeriodPreset } from './filters'

interface PeriodPickerProps {
  filters: Pick<EventFilters, 'from' | 'to'>
  today: string
  onPreset: (preset: PeriodPreset) => void
}

/** 기록 조회 기간 빠른 선택. 정확한 날짜는 아래 조건에서 직접 고른다. */
export function PeriodPicker({ filters, today, onPreset }: PeriodPickerProps) {
  const current = matchPreset(filters, today)
  return (
    <div className="space-y-2">
      <div role="group" aria-label="조회 기간" className="flex flex-wrap gap-2">
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={current === preset ? 'primary' : 'secondary'}
            aria-pressed={current === preset}
            onClick={() => onPreset(preset)}
          >
            {PERIOD_LABELS[preset]}
          </Button>
        ))}
        <Button
          size="sm"
          variant={current === null ? 'primary' : 'secondary'}
          aria-pressed={current === null}
          onClick={() =>
            document.querySelector<HTMLInputElement>('[data-event-filter-from]')?.focus()
          }
        >
          직접 선택
        </Button>
      </div>
      <p className="text-body-sm text-ink-muted">
        조회 기간: {formatShortKey(filters.from)} ~ {formatShortKey(filters.to)}
      </p>
    </div>
  )
}
