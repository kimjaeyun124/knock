import { useState } from 'react'
import {
  ALL_WEEKDAYS,
  WEEKDAY_LABELS,
  type AlertPreferencesInput,
  type DetectionSettings,
  type Sensor,
} from '@tetris/shared'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { AlertDialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/fields'
import { Switch } from '@/components/ui/Switch'
import { validateSchedule } from '@/features/onboarding/schedule'
import { cn } from '@/lib/cn'
import { describeWeekdays } from '@/lib/night'
import { usePatchDetection } from '../hooks'
import { describeBlockedAlerts, dangerItems } from './blocked'
import { SaveBar } from './SaveBar'
import { useSaveState } from './useSection'

const WEEKDAY_PRESETS: { label: string; days: number[] }[] = [
  { label: '매일', days: ALL_WEEKDAYS },
  { label: '평일', days: [0, 1, 2, 3, 4] },
  { label: '주말', days: [5, 6] },
]

const sameDays = (a: readonly number[], b: readonly number[]) =>
  [...a].sort().join() === [...b].sort().join()

/** 1. 모니터링 설정: 사용 여부 · 요일별 일정 · 감지 시작/종료 시간 · 시간대 */
export function MonitoringSection({
  settings,
  prefs,
  sensors,
}: {
  settings: DetectionSettings
  prefs: AlertPreferencesInput
  sensors: readonly Sensor[]
}) {
  const patch = usePatchDetection()
  const state = useSaveState()
  const [enabled, setEnabled] = useState(settings.monitoringEnabled)
  const [days, setDays] = useState<number[]>(settings.activeWeekdays)
  const [start, setStart] = useState(settings.nightStart)
  const [end, setEnd] = useState(settings.nightEnd)
  const [errors, setErrors] = useState<{ start?: string; end?: string; days?: string }>({})
  const [confirming, setConfirming] = useState(false)

  const dirty =
    enabled !== settings.monitoringEnabled ||
    !sameDays(days, settings.activeWeekdays) ||
    start !== settings.nightStart ||
    end !== settings.nightEnd

  const touch = () => state.clearSaved()
  const toggleDay = (day: number) => {
    touch()
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    )
  }

  const validate = (): boolean => {
    const schedule = validateSchedule(start, end)
    const next: typeof errors = {}
    if (schedule.nightStart) next.start = schedule.nightStart
    if (schedule.nightEnd) next.end = schedule.nightEnd
    if (enabled && days.length === 0) {
      next.days = '모니터링할 요일을 하나 이상 고르거나, 모니터링을 끄세요.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = () => {
    state.start()
    patch.mutate(
      { monitoringEnabled: enabled, activeWeekdays: days, nightStart: start, nightEnd: end },
      {
        onSuccess: () => {
          setConfirming(false)
          state.succeeded()
        },
        onError: (cause) => {
          setConfirming(false)
          state.failed(cause)
        },
      },
    )
  }

  // 이 저장이 "중요한 알림을 막는 쪽으로" 바꾸는 경우(모니터링 끄기·요일 빼기)에만 한 번 더 확인한다.
  // (이미 막혀 있던 것을 다시 켜는 저장에는 묻지 않는다.)
  const turningOff = settings.monitoringEnabled && !enabled
  const removedDays = settings.activeWeekdays.some((day) => !days.includes(day))
  const newlyDanger = dangerItems(
    describeBlockedAlerts({
      detection: { ...settings, monitoringEnabled: enabled, activeWeekdays: days },
      prefs,
      sensors,
    }),
  ).filter(
    (item) =>
      (item.id === 'monitoring-off' && turningOff) || (item.id === 'weekdays' && removedDays),
  )

  const onSave = () => {
    if (!validate()) return
    if (newlyDanger.length > 0) setConfirming(true)
    else save()
  }

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <Card
      title="모니터링"
      description="움직임 알림을 언제 판단할지 정합니다. 움직임 신호 자체는 설정과 상관없이 항상 기록됩니다."
    >
      <div id="monitoring" className="space-y-5">
        <Switch
          label="모니터링 사용"
          description="끄면 야간 움직임 알림이 만들어지지 않습니다. 센서 연결·배터리 알림은 이 설정과 별개입니다."
          checked={enabled}
          onCheckedChange={(next) => {
            touch()
            setEnabled(next)
          }}
        />
        {!enabled ? (
          <Callout tone="danger" title="모니터링을 끄면 움직임 알림이 오지 않습니다">
            <p className="text-body-sm">
              현관 근처 움직임을 포함해 모든 움직임 알림이 전달되지 않습니다. 움직임 기록에는 그대로
              남습니다.
            </p>
          </Callout>
        ) : null}

        <fieldset className="space-y-2" disabled={!enabled}>
          <legend className="text-body font-semibold">모니터링할 요일</legend>
          <p className="text-body-sm text-ink-muted">
            야간 시간이 시작되는 날을 기준으로 합니다. 예) 월요일만 고르면 월요일 밤 10시부터 화요일
            새벽까지가 해당됩니다.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="요일 선택">
            {ALL_WEEKDAYS.map((day) => {
              const on = days.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'inline-flex size-12 items-center justify-center rounded-control border-2 text-body font-bold disabled:opacity-60',
                    on
                      ? 'border-brand bg-brand text-ink-inverse'
                      : 'border-line-strong bg-surface text-ink',
                  )}
                >
                  {WEEKDAY_LABELS[day]}
                  <span className="sr-only">요일{on ? ' (선택됨)' : ''}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  touch()
                  setDays(preset.days)
                }}
                className="inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 text-body-sm font-semibold"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-body-sm">현재 선택: {describeWeekdays(days)}</p>
          {errors.days ? (
            <p role="alert" className="text-body-sm font-semibold text-status-danger">
              {errors.days}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="감지 시작 시간"
            type="time"
            value={start}
            error={errors.start}
            onChange={(event) => {
              touch()
              setStart(event.target.value)
            }}
          />
          <TextField
            label="감지 종료 시간"
            type="time"
            value={end}
            error={errors.end}
            onChange={(event) => {
              touch()
              setEnd(event.target.value)
            }}
          />
        </div>
        <p className="text-body-sm text-ink-muted">
          종료가 시작보다 이르면 자정을 넘는 구간입니다. 야간이 아닌 낮 시간의 움직임은 알림으로
          판단하지 않습니다.
        </p>

        <div className="rounded-card bg-canvas p-4">
          <h3 className="text-h3">시간대</h3>
          <p className="text-body">
            한국 표준시 (Asia/Seoul, UTC+9) <span className="text-ink-muted">· 고정</span>
          </p>
          <p className="text-body-sm text-ink-muted">
            위의 시간은 모두 이 시간대 기준입니다. 이 시간대는 바꿀 수 없습니다.
            {deviceZone !== 'Asia/Seoul'
              ? ` 이 기기의 시간대는 ${deviceZone}이라, 움직임 기록 화면의 시각은 기기 시간대로 표시되어 위의 시간과 다르게 보일 수 있습니다.`
              : ''}
          </p>
        </div>

        <SaveBar
          dirty={dirty}
          saving={patch.isPending}
          error={state.error}
          savedAt={state.savedAt}
          onSave={onSave}
          onReset={() => {
            setEnabled(settings.monitoringEnabled)
            setDays(settings.activeWeekdays)
            setStart(settings.nightStart)
            setEnd(settings.nightEnd)
            setErrors({})
          }}
        />
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="중요한 알림이 전달되지 않게 됩니다"
        description={
          <span className="block space-y-2">
            {newlyDanger.map((item) => (
              <span key={item.id} className="block">
                <strong className="block">{item.title}</strong>
                <span className="block text-body-sm">{item.detail}</span>
              </span>
            ))}
            <span className="block">그래도 저장할까요? 나중에 언제든 다시 켤 수 있습니다.</span>
          </span>
        }
        confirmLabel="그래도 저장"
        tone="danger"
        loading={patch.isPending}
        onConfirm={save}
      />
    </Card>
  )
}
