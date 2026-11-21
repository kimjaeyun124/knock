import { useState, type FormEvent } from 'react'
import {
  DetectionSettingsInputSchema,
  SENSITIVITIES,
  SENSITIVITY_LABELS,
  type DetectionSettings,
  type DetectionSettingsInput,
  type Sensitivity,
} from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { TextField } from '@/components/ui/fields'
import { formatDateTime } from '@/lib/format'
import { useDetectionSettings, useUpdateDetectionSettings } from './hooks'

const SENSITIVITY_HINTS: Record<Sensitivity, string> = {
  LOW: '현관 근처 움직임과, 짧은 시간에 여러 구역을 많이 오갈 때만 알립니다.',
  MEDIUM: '위에 더해 침대 주변에서 이동 경로로 움직임이 이어질 때도 알립니다.',
  HIGH: '위에 더해 침대 주변의 움직임도 알립니다. 알림이 가장 많습니다.',
}

type NumberKey =
  | 'sequenceWindowMinutes'
  | 'cooldownMinutes'
  | 'reminderMinutes'
  | 'offlineAfterSeconds'
  | 'lowBatteryPercent'
  | 'criticalBatteryPercent'
  | 'retentionDays'

const NUMBER_FIELDS: { key: NumberKey; label: string; unit: string; hint: string }[] = [
  {
    key: 'sequenceWindowMinutes',
    label: '움직임을 하나의 흐름으로 보는 시간',
    unit: '분',
    hint: '침대 주변 다음에 이동 경로에서 움직임이 이 시간 안에 이어지면 한 흐름으로 봅니다. (1–60)',
  },
  {
    key: 'cooldownMinutes',
    label: '같은 알림을 다시 만들지 않는 시간',
    unit: '분',
    hint: '이 시간 안의 비슷한 신호는 기존 알림에 합쳐집니다. (1–120)',
  },
  {
    key: 'reminderMinutes',
    label: '긴급 알림 재알림 간격',
    unit: '분',
    hint: '확인하지 않은 긴급 알림을 이 간격으로 최대 3번 다시 알립니다. (1–60)',
  },
  {
    key: 'offlineAfterSeconds',
    label: '신호가 없으면 연결 끊김으로 보는 시간',
    unit: '초',
    hint: '센서가 이 시간 동안 아무 신호도 보내지 않으면 연결이 끊긴 것으로 봅니다. (60–3600)',
  },
  {
    key: 'lowBatteryPercent',
    label: '배터리 부족 기준',
    unit: '%',
    hint: '이 값 이하이면 배터리 부족으로 표시합니다. (5–50)',
  },
  {
    key: 'criticalBatteryPercent',
    label: '배터리 위급 기준',
    unit: '%',
    hint: '부족 기준보다 낮아야 합니다. (1–49)',
  },
  {
    key: 'retentionDays',
    label: '움직임 기록 보관 기간',
    unit: '일',
    hint: '이 기간이 지난 움직임 기록은 자동으로 삭제됩니다. (7–365)',
  },
]

interface FormState {
  nightStart: string
  nightEnd: string
  sensitivity: Sensitivity
  numbers: Record<NumberKey, string>
}

function toForm(settings: DetectionSettingsInput): FormState {
  return {
    nightStart: settings.nightStart,
    nightEnd: settings.nightEnd,
    sensitivity: settings.sensitivity,
    numbers: Object.fromEntries(
      NUMBER_FIELDS.map(({ key }) => [key, String(settings[key])]),
    ) as Record<NumberKey, string>,
  }
}

interface SettingsFormProps {
  settings: DetectionSettings
  onSave: (input: DetectionSettingsInput) => void
  saving: boolean
  saveError: Error | null
  /** 가장 최근에 저장에 성공한 설정. 저장 후 폼이 새 값으로 다시 시작해도 저장 표시를 유지한다. */
  savedSettings: DetectionSettings | null
}

function SettingsForm({ settings, onSave, saving, saveError, savedSettings }: SettingsFormProps) {
  const [form, setForm] = useState(() => toForm(settings))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const candidate = {
      // 모니터링 사용 여부·요일은 설정 화면(/settings)에서 바꾼다. 여기서는 저장된 값을 그대로 보낸다.
      monitoringEnabled: settings.monitoringEnabled,
      activeWeekdays: settings.activeWeekdays,
      nightStart: form.nightStart,
      nightEnd: form.nightEnd,
      sensitivity: form.sensitivity,
      ...Object.fromEntries(
        NUMBER_FIELDS.map(({ key }) => [
          key,
          form.numbers[key].trim() === '' ? Number.NaN : Number(form.numbers[key]),
        ]),
      ),
    }
    const parsed = DetectionSettingsInputSchema.safeParse(candidate)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    onSave(parsed.data)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Card title="야간 시간대">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="시작"
            type="time"
            value={form.nightStart}
            error={errors.nightStart}
            onChange={(event) => setForm({ ...form, nightStart: event.target.value })}
          />
          <TextField
            label="종료"
            type="time"
            value={form.nightEnd}
            error={errors.nightEnd}
            onChange={(event) => setForm({ ...form, nightEnd: event.target.value })}
          />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          한국 시간 기준입니다. 종료가 시작보다 이르면 자정을 넘는 구간(예: 22:00–06:00)입니다.
          움직임 알림은 이 시간대에 발생한 신호만 판단합니다.
        </p>
      </Card>

      <Card title="민감도">
        <fieldset>
          <legend className="sr-only">민감도</legend>
          <div className="space-y-2">
            {SENSITIVITIES.map((value) => (
              <label
                key={value}
                className="flex min-h-12 items-start gap-3 rounded-control border border-line p-3"
              >
                <input
                  type="radio"
                  name="sensitivity"
                  value={value}
                  checked={form.sensitivity === value}
                  onChange={() => setForm({ ...form, sensitivity: value })}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">{SENSITIVITY_LABELS[value]}</span>
                  <span className="block text-sm text-ink-muted">{SENSITIVITY_HINTS[value]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card title="시간과 기준">
        <div className="space-y-4">
          {NUMBER_FIELDS.map(({ key, label, unit, hint }) => (
            <TextField
              key={key}
              label={`${label} (${unit})`}
              hint={hint}
              type="number"
              inputMode="numeric"
              value={form.numbers[key]}
              error={errors[key]}
              onChange={(event) =>
                setForm({ ...form, numbers: { ...form.numbers, [key]: event.target.value } })
              }
            />
          ))}
        </div>
      </Card>

      <Callout tone="info" title="알아 두세요">
        <p className="text-sm">
          설정을 바꿔도 이미 처리된 신호를 다시 판단하지는 않습니다. 새로 들어오는 신호부터
          적용됩니다. 기준값은 초기값이며, 실제 환경에서 확인하며 조정해야 합니다.
        </p>
      </Callout>

      <div className="space-y-2">
        <Button type="submit" disabled={saving}>
          {saving ? '저장하는 중…' : '저장'}
        </Button>
        {savedSettings ? (
          <p role="status">저장했습니다. ({formatDateTime(savedSettings.updatedAt)})</p>
        ) : null}
        {saveError ? (
          <p role="alert" className="text-status-danger">
            {saveError.message}
          </p>
        ) : null}
        {Object.keys(errors).length > 0 ? (
          <p role="alert" className="text-status-danger">
            입력한 내용을 확인해 주세요.
          </p>
        ) : null}
      </div>
    </form>
  )
}

export function DetectionSettingsPage() {
  const query = useDetectionSettings()
  const update = useUpdateDetectionSettings()
  const [savedSettings, setSavedSettings] = useState<DetectionSettings | null>(null)
  const save = (input: DetectionSettingsInput) => {
    setSavedSettings(null)
    // 저장하면 설정이 바뀌어 폼이 새 값으로 다시 만들어지므로, 결과 표시는 이 페이지가 들고 있는다.
    update.mutate(input, { onSuccess: setSavedSettings })
  }
  return (
    <div className="space-y-4">
      <h1 className="text-h1">감지 시간·민감도</h1>
      {query.isError ? (
        <ErrorState
          title="설정을 불러오지 못했습니다"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        // 다른 기기에서 저장되어 값이 바뀌면(updatedAt) 폼을 새 값으로 다시 시작한다.
        <SettingsForm
          key={query.data.updatedAt}
          settings={query.data}
          onSave={save}
          saving={update.isPending}
          saveError={update.error}
          savedSettings={savedSettings}
        />
      ) : (
        <LoadingState label="설정을 불러오는 중" />
      )}
    </div>
  )
}
