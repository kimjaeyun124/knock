import type { AlertPreferencesInput } from '@tetris/shared'
import { Callout } from '@/components/ui/Callout'
import { Switch } from '@/components/ui/Switch'

interface PreferenceRow {
  key: keyof AlertPreferencesInput
  label: string
  description: string
}

const MOVEMENT_ROWS: PreferenceRow[] = [
  {
    key: 'entranceApproach',
    label: '현관 근처 움직임',
    description: '야간 모니터링 시간에 현관 센서가 움직임을 감지했을 때 알립니다.',
  },
  {
    key: 'bedToPath',
    label: '침대 주변에서 이동 경로로 이어진 움직임',
    description: '침대 주변 다음에 이동 경로(복도 등)에서 움직임이 이어졌을 때 알립니다.',
  },
  {
    key: 'repeatedMovement',
    label: '짧은 시간 안의 반복된 움직임',
    description: '짧은 시간 안에 여러 구역에서 움직임이 반복되었을 때 알립니다.',
  },
  {
    key: 'bedAreaActivity',
    label: '침대 주변 움직임',
    description:
      '침대 주변 센서의 움직임을 알립니다. 알림이 가장 많아서 민감도를 "높음"으로 둘 때만 만들어집니다.',
  },
]

const SENSOR_ROWS: PreferenceRow[] = [
  {
    key: 'sensorIssues',
    label: '센서 이상 알림',
    description:
      '센서 연결 끊김과 복구를 알립니다. 꺼도 센서 화면과 대시보드에는 연결 상태가 계속 표시됩니다.',
  },
  {
    key: 'lowBattery',
    label: '배터리 부족 알림',
    description:
      '센서 배터리가 부족하거나 거의 없을 때 알립니다. 꺼도 센서 화면에는 배터리 상태가 계속 표시되지만, 배터리가 떨어지면 센서가 멈출 수 있습니다.',
  },
]

/** 어떤 알림을 받을지 고르는 스위치 묶음. 초기 설정과 설정 화면이 함께 쓴다. */
export function AlertPreferenceFields({
  value,
  onChange,
  disabled = false,
}: {
  value: AlertPreferencesInput
  onChange: (next: AlertPreferencesInput) => void
  disabled?: boolean
}) {
  const allOff = Object.values(value).every((on) => !on)
  const render = (rows: PreferenceRow[]) =>
    rows.map((row) => (
      <li key={row.key} className="py-3">
        <Switch
          label={row.label}
          description={row.description}
          checked={value[row.key]}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ ...value, [row.key]: checked })}
        />
      </li>
    ))

  return (
    <div className="space-y-4">
      <section aria-labelledby="alert-pref-movement">
        <h3 id="alert-pref-movement" className="text-h3">
          움직임 알림
        </h3>
        <ul className="divide-y divide-line">{render(MOVEMENT_ROWS)}</ul>
      </section>
      <section aria-labelledby="alert-pref-sensor">
        <h3 id="alert-pref-sensor" className="text-h3">
          센서 이상 알림
        </h3>
        <ul className="divide-y divide-line">{render(SENSOR_ROWS)}</ul>
      </section>
      <p className="text-body-sm text-ink-muted">
        끈 종류의 알림은 만들어지지 않습니다. 움직임은 움직임 기록에 그대로 남습니다. 알림을
        전달하지 못했을 때의 알림은 항상 켜져 있습니다.
      </p>
      {allOff ? (
        <Callout tone="warn" title="모든 알림을 껐습니다">
          <p className="text-body-sm">
            이렇게 하면 어떤 일이 있어도 알림이 오지 않고, 화면을 직접 열어야 확인할 수 있습니다.
          </p>
        </Callout>
      ) : null}
    </div>
  )
}
