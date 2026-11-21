import { SIMULATOR_MOTION_MODES } from '@tetris/shared'
import { SelectField, TextField } from '@/components/ui/fields'
import { MODE_LABELS, toMotionOptions, type SendSettings } from './sendSettings'

/** 이벤트 유형(전송 방식)과 발생 시각 선택. 아래 센서의 "움직임 보내기"에 적용된다. */
export function SendOptions({
  value,
  onChange,
}: {
  value: SendSettings
  onChange: (next: SendSettings) => void
}) {
  const invalid = value.mode === 'burst' && toMotionOptions(value) === null
  return (
    <fieldset className="space-y-3 rounded-control border border-line p-3">
      <legend className="px-1 font-semibold">이벤트 유형</legend>
      <SelectField
        label="전송 방식"
        hint="아래 센서의 ‘움직임 보내기’를 누르면 이 방식으로 보냅니다."
        value={value.mode}
        onChange={(event) =>
          onChange({ ...value, mode: event.target.value as SendSettings['mode'] })
        }
      >
        {SIMULATOR_MOTION_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {MODE_LABELS[mode]}
          </option>
        ))}
      </SelectField>
      {value.mode === 'burst' ? (
        <TextField
          label="건수 (2~20)"
          type="number"
          inputMode="numeric"
          value={value.count}
          error={invalid ? '2~20 사이의 정수를 입력해 주세요.' : null}
          onChange={(event) => onChange({ ...value, count: event.target.value })}
        />
      ) : null}
      <label className="flex min-h-12 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-brand"
          checked={value.night}
          onChange={(event) => onChange({ ...value, night: event.target.checked })}
        />
        <span>
          <span className="block font-semibold">
            가장 최근의 야간 시간으로 보내기 (야간 이벤트 테스트)
          </span>
          <span className="block text-body-sm text-ink-muted">
            낮에도 야간 규칙을 시험할 수 있습니다. 발생 시각을 과거의 야간으로 실어 보내므로 서버는
            "늦게 도착한 신호"로 표시합니다. 지금이 야간이면 그냥 지금 보냅니다.
          </span>
        </span>
      </label>
    </fieldset>
  )
}
