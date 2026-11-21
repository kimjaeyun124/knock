import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { TextField } from '@/components/ui/fields'
import { formatTimeOfDay } from '@/lib/format'
import {
  SUGGESTED_NIGHT,
  crossesMidnight,
  describeDuration,
  durationMinutes,
  validateSchedule,
  type ScheduleErrors,
} from './schedule'

/** STEP 4. 모니터링 시간. 기본 야간 시간을 제안하고 직접 고칠 수 있다. */
export function ScheduleStep({
  start,
  end,
  onChange,
  onBack,
  onNext,
  saving,
  error,
}: {
  start: string
  end: string
  onChange: (next: { start: string; end: string }) => void
  onBack: () => void
  onNext: (value: { start: string; end: string }) => void
  saving: boolean
  error: string | null
}) {
  const [errors, setErrors] = useState<ScheduleErrors>({})
  const isSuggestion = start === SUGGESTED_NIGHT.start && end === SUGGESTED_NIGHT.end
  const valid = Object.keys(validateSchedule(start, end)).length === 0

  const submit = () => {
    const found = validateSchedule(start, end)
    setErrors(found)
    if (Object.keys(found).length === 0) onNext({ start, end })
  }

  return (
    <Card title="언제 살필까요?">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <p>
          움직임 알림은 여기서 정한 시간에 감지된 신호만 판단합니다. 보통 주무시는 시간으로 정하면
          됩니다.
        </p>
        <Callout tone="info" title="제안: 밤 10시부터 아침 6시까지 (8시간)">
          <p className="text-body-sm">
            많이 쓰는 야간 시간입니다. 생활 리듬에 맞게 아래에서 바꿀 수 있습니다.
          </p>
          <Button
            className="mt-2"
            variant="secondary"
            disabled={isSuggestion}
            onClick={() => {
              setErrors({})
              onChange({ start: SUGGESTED_NIGHT.start, end: SUGGESTED_NIGHT.end })
            }}
          >
            {isSuggestion ? '제안한 시간으로 설정되어 있습니다' : '제안한 시간으로 되돌리기'}
          </Button>
        </Callout>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="시작 시각"
            type="time"
            value={start}
            error={errors.nightStart}
            onChange={(event) => onChange({ start: event.target.value, end })}
          />
          <TextField
            label="종료 시각"
            type="time"
            value={end}
            error={errors.nightEnd}
            onChange={(event) => onChange({ start, end: event.target.value })}
          />
        </div>
        {valid ? (
          <p aria-live="polite" className="font-semibold">
            {formatTimeOfDay(start)}부터 {crossesMidnight(start, end) ? '다음 날 ' : ''}
            {formatTimeOfDay(end)}까지, {describeDuration(durationMinutes(start, end))} 동안
            살핍니다.
          </p>
        ) : null}
        <p className="text-body-sm text-ink-muted">
          한국 시간 기준입니다. 종료가 시작보다 이르면 자정을 넘는 구간으로 봅니다. 감지 민감도 등
          자세한 기준은 설정 → 감지 시간·민감도에서 바꿀 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onBack} disabled={saving}>
            이전
          </Button>
          <Button type="submit" loading={saving} loadingText="저장하는 중…">
            다음
          </Button>
        </div>
        {error ? (
          <p role="alert" className="font-semibold text-status-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  )
}
