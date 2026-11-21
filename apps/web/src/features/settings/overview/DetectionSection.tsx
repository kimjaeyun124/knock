import { useState } from 'react'
import {
  SENSITIVITIES,
  SENSITIVITY_LABELS,
  ZONE_LABELS,
  type AlertPreferencesInput,
  type DetectionSettings,
  type Sensitivity,
  type Sensor,
} from '@tetris/shared'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { AlertDialog } from '@/components/ui/Dialog'
import { SelectField, TextField } from '@/components/ui/fields'
import { Switch } from '@/components/ui/Switch'
import { useUpdateSensor } from '@/features/sensors/hooks'
import { describeSensorError } from '@/features/sensors/sensorErrors'
import { ALERT_TYPE_LABELS } from '@/lib/labels'
import { usePatchAlertPreferences, usePatchDetection } from '../hooks'
import { describeBlockedAlerts, dangerItems } from './blocked'
import { ruleSummary, sensorSensitivityEffect, type MovementRuleType } from './rules'
import { SaveBar } from './SaveBar'
import { useSaveState } from './useSection'

const SENSITIVITY_HINTS: Record<Sensitivity, string> = {
  LOW: '현관 근처 움직임과, 짧은 시간에 여러 구역을 많이 오갈 때만 알립니다.',
  MEDIUM: '위에 더해 침대 주변에서 이동 경로로 움직임이 이어질 때도 알립니다.',
  HIGH: '위에 더해 침대 주변의 움직임도 알립니다. 알림이 가장 많습니다.',
}

const MOVEMENT_ROWS: { key: keyof AlertPreferencesInput; type: MovementRuleType }[] = [
  { key: 'entranceApproach', type: 'ENTRANCE_APPROACH' },
  { key: 'bedToPath', type: 'BED_TO_PATH' },
  { key: 'repeatedMovement', type: 'REPEATED_MOVEMENT' },
  { key: 'bedAreaActivity', type: 'BED_AREA_ACTIVITY' },
]

function SensorSensitivityRow({ sensor, fallback }: { sensor: Sensor; fallback: Sensitivity }) {
  const update = useUpdateSensor(sensor.id)
  const [saved, setSaved] = useState(false)
  const level = sensor.sensitivity ?? fallback
  const failure = update.isError ? describeSensorError(update.error) : null

  return (
    <li className="space-y-2 py-4">
      <SelectField
        label={`${sensor.name} (${ZONE_LABELS[sensor.zone]})`}
        value={sensor.sensitivity ?? 'DEFAULT'}
        disabled={!sensor.isActive || update.isPending}
        onChange={(event) => {
          setSaved(false)
          const value = event.target.value
          update.mutate(
            { sensitivity: value === 'DEFAULT' ? null : (value as Sensitivity) },
            { onSuccess: () => setSaved(true) },
          )
        }}
      >
        <option value="DEFAULT">기본 설정 따르기 ({SENSITIVITY_LABELS[fallback]})</option>
        {SENSITIVITIES.map((value) => (
          <option key={value} value={value}>
            {SENSITIVITY_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <p className="text-body-sm text-ink-muted">
        {sensor.isActive
          ? sensorSensitivityEffect(sensor.zone, level)
          : '사용하지 않는 센서입니다. 사용으로 켜면 설정을 바꿀 수 있습니다.'}
      </p>
      <p className="text-body-sm font-semibold">
        {sensor.hardwareSensitivitySupported
          ? '이 센서는 하드웨어 감도도 조절할 수 있습니다.'
          : '이 센서는 하드웨어 민감도 조절을 지원하지 않습니다. 서버가 신호를 해석하는 기준만 바뀌고, 센서의 감지 감도는 그대로입니다.'}
      </p>
      {update.isPending ? <p role="status">저장하는 중…</p> : null}
      {saved && !update.isPending && !update.isError ? (
        <p role="status" className="font-semibold text-status-ok">
          저장했습니다.
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="font-semibold text-status-danger">
          저장하지 못했습니다. 서버에 반영되지 않았습니다. {failure.cause} {failure.solution}
        </p>
      ) : null}
    </li>
  )
}

/** 2-1. 민감도(서버 판단 기준)와 반복 감지 처리 시간 */
function SensitivityCard({
  settings,
  sensors,
}: {
  settings: DetectionSettings
  sensors: readonly Sensor[]
}) {
  const patch = usePatchDetection()
  const state = useSaveState()
  const [sensitivity, setSensitivity] = useState(settings.sensitivity)
  const [windowText, setWindowText] = useState(String(settings.sequenceWindowMinutes))
  const [error, setError] = useState<string | null>(null)
  const dirty =
    sensitivity !== settings.sensitivity || windowText !== String(settings.sequenceWindowMinutes)

  const save = () => {
    const minutes = windowText.trim() === '' ? Number.NaN : Number(windowText)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      setError('처리 시간은 1~60분 사이의 정수로 입력해 주세요.')
      return
    }
    setError(null)
    state.start()
    patch.mutate(
      { sensitivity, sequenceWindowMinutes: minutes },
      { onSuccess: state.succeeded, onError: state.failed },
    )
  }

  return (
    <Card title="민감도와 반복 감지">
      <div className="space-y-5">
        <Callout tone="info" title="이 민감도는 서버가 신호를 해석하는 기준입니다">
          <p className="text-body-sm">
            센서 하드웨어가 얼마나 예민하게 움직임을 감지하는지(물리적 감도)와는 별개입니다. 지금
            지원하는 센서는 하드웨어 민감도 조절이 없어, 여기서 바꾸는 값은 서버가 어떤 신호를
            알림으로 만들지를 정하는 기준만 바꿉니다.
          </p>
        </Callout>

        <fieldset>
          <legend className="text-body font-semibold">기본 민감도 (모든 센서)</legend>
          <div className="mt-2 space-y-2">
            {SENSITIVITIES.map((value) => (
              <label
                key={value}
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-control border border-line-strong p-3"
              >
                <input
                  type="radio"
                  name="household-sensitivity"
                  className="mt-1 size-5 accent-brand"
                  checked={sensitivity === value}
                  onChange={() => {
                    state.clearSaved()
                    setSensitivity(value)
                  }}
                />
                <span>
                  <span className="block font-semibold">{SENSITIVITY_LABELS[value]}</span>
                  <span className="block text-body-sm text-ink-muted">
                    {SENSITIVITY_HINTS[value]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <TextField
          label="반복 감지 처리 시간 (분)"
          hint="침대 주변 신호 뒤 이 시간 안에 이동 경로 신호가 이어지면 하나의 흐름으로 봅니다. (1–60) 같은 종류의 알림을 합치는 간격은 ‘알림’ 구역의 중복 알림 간격입니다."
          type="number"
          inputMode="numeric"
          value={windowText}
          error={error}
          onChange={(event) => {
            state.clearSaved()
            setWindowText(event.target.value)
          }}
        />

        <SaveBar
          dirty={dirty}
          saving={patch.isPending}
          error={state.error}
          savedAt={state.savedAt}
          onSave={save}
          onReset={() => {
            setSensitivity(settings.sensitivity)
            setWindowText(String(settings.sequenceWindowMinutes))
            setError(null)
          }}
        />

        <section aria-labelledby="per-sensor" className="border-t border-line pt-4">
          <h3 id="per-sensor" className="text-h3">
            센서별 민감도
          </h3>
          <p className="text-body-sm text-ink-muted">
            센서마다 따로 정하면 그 센서의 신호에는 이 값이 우선합니다. 고르는 즉시 서버에
            저장됩니다.
          </p>
          {sensors.length === 0 ? (
            <p className="mt-2">등록된 센서가 없습니다. 센서를 등록하면 여기에 나타납니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sensors.map((sensor) => (
                <SensorSensitivityRow
                  key={sensor.id}
                  sensor={sensor}
                  fallback={settings.sensitivity}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  )
}

/** 2-2. 이벤트 판단 규칙과 감지 이벤트별 알림 여부 */
function EventRulesCard({
  settings,
  prefs,
  sensors,
}: {
  settings: DetectionSettings
  prefs: AlertPreferencesInput
  sensors: readonly Sensor[]
}) {
  const patch = usePatchAlertPreferences()
  const state = useSaveState()
  const [draft, setDraft] = useState(prefs)
  const [confirming, setConfirming] = useState(false)
  const dirty = MOVEMENT_ROWS.some(({ key }) => draft[key] !== prefs[key])

  const changes = Object.fromEntries(MOVEMENT_ROWS.map(({ key }) => [key, draft[key]]))
  const save = () => {
    state.start()
    patch.mutate(changes, {
      onSuccess: () => {
        setConfirming(false)
        state.succeeded()
      },
      onError: (cause) => {
        setConfirming(false)
        state.failed(cause)
      },
    })
  }

  const before = new Set(
    dangerItems(describeBlockedAlerts({ detection: settings, prefs, sensors })).map((i) => i.id),
  )
  const newlyDanger = dangerItems(
    describeBlockedAlerts({ detection: settings, prefs: { ...prefs, ...changes }, sensors }),
  ).filter((item) => !before.has(item.id))

  return (
    <Card
      title="이벤트 판단 규칙과 알림"
      description="움직임이 어떤 조건에서 알림이 되는지 보고, 종류별로 알림을 받을지 정합니다."
    >
      <div id="detect-events" className="space-y-4">
        <ul className="divide-y divide-line">
          {MOVEMENT_ROWS.map(({ key, type }) => (
            <li key={key} className="space-y-2 py-4">
              <Switch
                label={ALERT_TYPE_LABELS[type]}
                description={ruleSummary(type, settings)}
                checked={draft[key]}
                disabled={patch.isPending}
                onCheckedChange={(next) => {
                  state.clearSaved()
                  setDraft((current) => ({ ...current, [key]: next }))
                }}
              />
              {!draft[key] ? (
                <p className="text-body-sm font-semibold text-status-warn-strong">
                  끄면 이 알림이 전달되지 않습니다. 움직임은 움직임 기록에 남습니다.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-ink-muted">
          규칙은 야간 시간에 감지된 신호에만 적용됩니다. 규칙 자체를 바꾸는 것은 지원하지 않으며,
          민감도와 처리 시간으로 조절합니다.
        </p>
        <SaveBar
          dirty={dirty}
          saving={patch.isPending}
          error={state.error}
          savedAt={state.savedAt}
          onSave={() => (newlyDanger.length > 0 ? setConfirming(true) : save())}
          onReset={() => setDraft(prefs)}
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

/** 2. 감지 설정 */
export function DetectionSection(props: {
  settings: DetectionSettings
  prefs: AlertPreferencesInput
  sensors: readonly Sensor[]
}) {
  return (
    <>
      <SensitivityCard settings={props.settings} sensors={props.sensors} />
      <EventRulesCard {...props} />
    </>
  )
}
