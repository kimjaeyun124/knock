import { useState, type FormEvent } from 'react'
import {
  SensorCreateSchema,
  ZONE_KINDS,
  ZONE_LABELS,
  type SensorWithTokenResponse,
  type ZoneKind,
} from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/fields'
import { useCreateSensor } from './hooks'
import { RegistrationWizard } from './RegistrationWizard'
import { ZONE_HINTS } from './zoneHints'

export function SensorForm({
  submitLabel,
  onCreated,
}: {
  submitLabel: string
  onCreated: (result: SensorWithTokenResponse) => void
}) {
  const create = useCreateSensor()
  const [name, setName] = useState('')
  const [zone, setZone] = useState<ZoneKind>('BED_SIDE')
  const [nameError, setNameError] = useState<string | null>(null)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = SensorCreateSchema.safeParse({ name, zone })
    if (!parsed.success) {
      setNameError('센서 이름을 1~50자로 입력해 주세요.')
      return
    }
    setNameError(null)
    create.mutate(parsed.data, { onSuccess: onCreated })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField
        label="센서 이름"
        hint="예: 침대 옆, 복도, 현관문"
        value={name}
        maxLength={50}
        error={nameError}
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        label="설치 구역"
        hint={ZONE_HINTS[zone]}
        value={zone}
        onChange={(event) => setZone(event.target.value as ZoneKind)}
      >
        {ZONE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ZONE_LABELS[kind]}
          </option>
        ))}
      </SelectField>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? '등록하는 중…' : submitLabel}
      </Button>
      {create.isError ? (
        <p role="alert" className="text-status-danger">
          {create.error.message}
        </p>
      ) : null}
    </form>
  )
}

export function SensorNewPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-h1">센서 등록</h1>
      <RegistrationWizard />
    </div>
  )
}
