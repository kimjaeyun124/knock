import { Check } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  SensorCreateSchema,
  ZONE_KINDS,
  ZONE_LABELS,
  type SensorKind,
  type SensorWithTokenResponse,
  type ZoneKind,
} from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { SelectField, TextField } from '@/components/ui/fields'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useFeatures } from '@/hooks/useFeatures'
import { cn } from '@/lib/cn'
import { useCreateSensor, useEnsureSimulatedSensors, useSensor } from './hooks'
import {
  SENSOR_TYPES,
  connectionOptions,
  defaultSensorName,
  stepsFor,
  type ConnectionMethod,
} from './registration'
import { describeSensorError } from './sensorErrors'
import { SensorErrorNotice } from './SensorErrorNotice'
import { SensorStatusBadges } from './SensorStatusBadges'
import { TokenReveal } from './TokenReveal'
import { ZONE_HINTS } from './zoneHints'

function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <nav aria-label="등록 단계">
      <p aria-live="polite" className="mb-2 text-body font-semibold text-ink-muted">
        {current + 1}/{steps.length} 단계 · {steps[current]}
      </p>
      <ol className="flex flex-wrap gap-2">
        {steps.map((label, index) => {
          const done = index < current
          const active = index === current
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-body-sm',
                active && 'border-brand bg-brand-soft font-bold text-brand-strong',
                done && 'border-status-ok bg-status-ok-soft text-status-ok-strong',
                !active && !done && 'border-line text-ink-muted',
              )}
            >
              {done ? <Check aria-hidden="true" className="size-4" /> : <span>{index + 1}.</span>}
              {label}
              {done ? <span className="sr-only"> (완료)</span> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function RadioCard({
  name,
  value,
  checked,
  disabled = false,
  onChange,
  label,
  description,
  reason,
}: {
  name: string
  value: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
  description: string
  reason?: string | undefined
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-card border-2 p-4',
        checked ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface',
        // 흐리게(opacity) 만들면 글자 대비가 기준 아래로 떨어진다. 바탕과 점선 테두리로 "고를 수 없음"을 알린다.
        disabled && 'cursor-not-allowed border-dashed bg-canvas',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 size-5 accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-body font-semibold">{label}</span>
        {/* 보조 글자색(ink-muted)은 연한 파랑 바탕에서 대비가 4.5:1 에 못 미친다. 선택된 카드에서는 기본 글자색을 쓴다. */}
        <span className={cn('block text-body-sm', checked ? 'text-ink' : 'text-ink-muted')}>
          {description}
        </span>
        {disabled && reason ? (
          <span className="mt-1 block text-body-sm font-semibold text-status-warn-strong">
            {reason}
          </span>
        ) : null}
      </span>
    </label>
  )
}

function Nav({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 pt-2">{children}</div>
}

/** 장치를 등록한 뒤 첫 신호가 오는지 기다리며 연결을 확인한다. */
function ConnectionCheckStep({
  created,
  onFinished,
}: {
  created: SensorWithTokenResponse
  onFinished: (() => void) | undefined
}) {
  const query = useSensor(created.sensor.id, { pollMs: 3000 })
  const sensor = query.data?.sensor ?? created.sensor
  const connected = sensor.lastSeenAt !== null
  const failure = query.isError ? describeSensorError(query.error) : null

  return (
    <div className="space-y-4">
      {connected ? (
        <Callout tone="ok" title="첫 신호를 받았습니다. 센서가 연결되었습니다">
          <SensorStatusBadges sensor={sensor} />
        </Callout>
      ) : (
        <Callout tone="info" title="아직 첫 신호를 받지 못했습니다">
          <p className="text-body-sm">
            센서가 첫 신호를 보내면 자동으로 연결됨으로 바뀝니다. 3초마다 다시 확인하고 있습니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm">
            <li>센서에 방금 받은 장치 토큰을 정확히 입력했는지 확인해 주세요.</li>
            <li>센서의 전원이 켜져 있고 배터리가 충분한지 확인해 주세요.</li>
            <li>센서가 서버에 닿을 수 있는 네트워크에 있는지 확인해 주세요.</li>
            <li>센서 앞에서 손을 움직여 움직임 신호를 한 번 보내 보세요.</li>
          </ul>
        </Callout>
      )}
      {failure ? (
        <SensorErrorNotice error={failure} headline="연결 상태를 확인하지 못했습니다." />
      ) : null}
      <Nav>
        {!connected ? (
          <Button
            variant="secondary"
            loading={query.isFetching}
            loadingText="확인하는 중…"
            onClick={() => void query.refetch()}
          >
            지금 확인
          </Button>
        ) : null}
        {onFinished ? (
          <Button variant={connected ? 'primary' : 'secondary'} onClick={onFinished}>
            {connected ? '등록 마치기' : '나중에 확인하고 마치기'}
          </Button>
        ) : (
          <>
            <Link
              to={PATHS.sensorDetail(created.sensor.id)}
              className={buttonStyles({ variant: connected ? 'primary' : 'secondary' })}
            >
              {connected ? '등록 마치기' : '나중에 확인하고 마치기'}
            </Link>
            <Link to={PATHS.sensors} className={buttonStyles({ variant: 'ghost' })}>
              센서 목록
            </Link>
          </>
        )}
      </Nav>
    </div>
  )
}

/** 시뮬레이션 센서 만들기. 만들어진 센서는 실제 장치가 아니라고 분명히 알린다. */
function SimulatorStep({
  onBack,
  onFinished,
}: {
  onBack: () => void
  onFinished: (() => void) | undefined
}) {
  const ensure = useEnsureSimulatedSensors()
  const failure = ensure.isError ? describeSensorError(ensure.error) : null
  const count = ensure.data?.sensors.length

  return (
    <div className="space-y-4">
      <Callout tone="warn" title="시뮬레이션 센서는 실제 장치가 아닙니다">
        <p className="text-body-sm">
          화면과 알림을 미리 확인하기 위한 가상의 센서입니다. 모든 화면에서 "시뮬레이션"으로
          표시되며 실제 센서처럼 연결되어 있다는 뜻이 아닙니다. 실제 장치는 "장치 토큰으로 연결"로
          등록해 주세요.
        </p>
      </Callout>
      {count !== undefined ? (
        <Callout tone="ok" title={`시뮬레이션 센서 ${count}개가 준비되었습니다`}>
          <p className="text-body-sm">침대 주변·이동 경로·현관에 하나씩 있습니다.</p>
        </Callout>
      ) : null}
      {failure ? (
        <SensorErrorNotice error={failure} headline="시뮬레이션 센서를 만들지 못했습니다." />
      ) : null}
      <Nav>
        {count === undefined ? (
          <>
            <Button variant="secondary" onClick={onBack} disabled={ensure.isPending}>
              이전
            </Button>
            <Button
              loading={ensure.isPending}
              loadingText="만드는 중…"
              onClick={() => ensure.mutate()}
            >
              시뮬레이션 센서 만들기
            </Button>
          </>
        ) : onFinished ? (
          <Button onClick={onFinished}>등록 마치기</Button>
        ) : (
          <Link to={PATHS.sensors} className={buttonStyles()}>
            센서 목록 보기
          </Link>
        )}
      </Nav>
    </div>
  )
}

/**
 * 센서 등록 안내 (5단계).
 *   1 센서 유형 → 2 연결 방식 → 3 이름과 설치 위치 → 4 장치 연결(등록·토큰) → 5 연결 확인
 * 시뮬레이션을 고르면 3단계로 줄어든다. 실제 장치와 시뮬레이션은 2단계에서 갈라진다.
 */
export function RegistrationWizard({
  onFinished,
  onCancel,
}: {
  /** 주어지면 마지막 단계가 센서 화면으로 이동하지 않고 이 함수를 부른다. (초기 설정 안에서 쓸 때) */
  onFinished?: () => void
  /** 주어지면 첫 단계에 "취소"가 생긴다. */
  onCancel?: () => void
} = {}) {
  const features = useFeatures()
  const simulatorEnabled = features.data?.simulatorEnabled ?? false
  const create = useCreateSensor()

  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<SensorKind>('MOTION')
  const [method, setMethod] = useState<ConnectionMethod>('DEVICE_TOKEN')
  const [zone, setZone] = useState<ZoneKind>('BED_SIDE')
  const [name, setName] = useState(() => defaultSensorName('BED_SIDE'))
  const [nameTouched, setNameTouched] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [created, setCreated] = useState<SensorWithTokenResponse | null>(null)

  const steps = stepsFor(method)
  const back = () => setStep((value) => Math.max(0, value - 1))
  const next = () => setStep((value) => value + 1)

  const chooseZone = (value: ZoneKind) => {
    setZone(value)
    // 직접 고친 이름은 그대로 두고, 아직 손대지 않았다면 구역에 맞는 기본 이름으로 바꾼다.
    if (!nameTouched) setName(defaultSensorName(value))
  }

  const submitNameAndZone = (event: FormEvent) => {
    event.preventDefault()
    const parsed = SensorCreateSchema.safeParse({ name, zone })
    if (!parsed.success) {
      setNameError('센서 이름을 1~50자로 입력해 주세요.')
      return
    }
    setNameError(null)
    next()
  }

  const register = () => {
    const parsed = SensorCreateSchema.safeParse({ name, zone })
    if (!parsed.success) return
    create.mutate(parsed.data, { onSuccess: setCreated })
  }

  const createFailure = create.isError ? describeSensorError(create.error) : null
  const options = connectionOptions(simulatorEnabled)

  return (
    <div className="space-y-4">
      <StepIndicator steps={steps} current={step} />

      {step === 0 ? (
        <Card title="센서 유형을 고르세요">
          <fieldset className="space-y-3">
            <legend className="sr-only">센서 유형</legend>
            {SENSOR_TYPES.map((type) => (
              <RadioCard
                key={type.kind}
                name="sensor-kind"
                value={type.kind}
                checked={kind === type.kind}
                onChange={() => setKind(type.kind)}
                label={type.label}
                description={type.description}
              />
            ))}
          </fieldset>
          <p className="mt-3 text-body-sm text-ink-muted">
            지원하는 센서 유형은 현재 이 하나입니다.
          </p>
          <Nav>
            {onCancel ? (
              <Button variant="secondary" onClick={onCancel}>
                취소
              </Button>
            ) : null}
            <Button onClick={next}>다음</Button>
          </Nav>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card title="어떻게 연결할까요?">
          <fieldset className="space-y-3">
            <legend className="sr-only">연결 방식</legend>
            {options.map((option) => (
              <RadioCard
                key={option.id}
                name="connection-method"
                value={option.id}
                checked={method === option.id}
                disabled={!option.available}
                onChange={() => {
                  if (option.id === 'DEVICE_TOKEN' || option.id === 'SIMULATOR') {
                    setMethod(option.id)
                  }
                }}
                label={option.label}
                description={option.description}
                reason={option.reason}
              />
            ))}
          </fieldset>
          <Nav>
            <Button variant="secondary" onClick={back}>
              이전
            </Button>
            <Button onClick={next}>다음</Button>
          </Nav>
        </Card>
      ) : null}

      {step === 2 && method === 'SIMULATOR' ? (
        <Card title="시뮬레이션 센서를 만듭니다">
          <SimulatorStep onBack={back} onFinished={onFinished} />
        </Card>
      ) : null}

      {step === 2 && method === 'DEVICE_TOKEN' ? (
        <Card title="이름과 설치 위치를 정하세요">
          <form onSubmit={submitNameAndZone} className="space-y-4" noValidate>
            <SelectField
              label="설치 구역"
              hint={ZONE_HINTS[zone]}
              value={zone}
              onChange={(event) => chooseZone(event.target.value as ZoneKind)}
            >
              {ZONE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {ZONE_LABELS[value]}
                </option>
              ))}
            </SelectField>
            <TextField
              label="센서 이름"
              hint="예: 침대 옆, 복도, 현관문. 나중에 바꿀 수 있습니다."
              value={name}
              maxLength={50}
              error={nameError}
              onChange={(event) => {
                setName(event.target.value)
                setNameTouched(true)
              }}
            />
            <Nav>
              <Button variant="secondary" onClick={back}>
                이전
              </Button>
              <Button type="submit">다음</Button>
            </Nav>
          </form>
        </Card>
      ) : null}

      {step === 3 && method === 'DEVICE_TOKEN' ? (
        <Card title={created ? '장치 토큰을 센서에 입력하세요' : '내용을 확인하고 등록하세요'}>
          {created ? (
            <div className="space-y-4">
              <p className="text-h3">“{created.sensor.name}” 센서를 등록했습니다</p>
              <TokenReveal token={created.deviceToken} title="장치 토큰" />
              <Nav>
                <Button onClick={next}>다음: 연결 확인</Button>
              </Nav>
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
                <dt className="text-ink-muted">센서 유형</dt>
                <dd className="font-semibold">
                  {SENSOR_TYPES.find((type) => type.kind === kind)?.label}
                </dd>
                <dt className="text-ink-muted">연결 방식</dt>
                <dd className="font-semibold">장치 토큰 (실제 센서)</dd>
                <dt className="text-ink-muted">설치 구역</dt>
                <dd className="font-semibold">{ZONE_LABELS[zone]}</dd>
                <dt className="text-ink-muted">센서 이름</dt>
                <dd className="font-semibold">{name}</dd>
              </dl>
              {createFailure ? (
                <SensorErrorNotice error={createFailure} headline="센서를 등록하지 못했습니다." />
              ) : null}
              <Nav>
                <Button variant="secondary" onClick={back} disabled={create.isPending}>
                  이전
                </Button>
                <Button loading={create.isPending} loadingText="등록하는 중…" onClick={register}>
                  센서 등록
                </Button>
              </Nav>
            </div>
          )}
        </Card>
      ) : null}

      {step === 4 && method === 'DEVICE_TOKEN' && created ? (
        <Card title="센서 연결을 확인합니다">
          <ConnectionCheckStep created={created} onFinished={onFinished} />
        </Card>
      ) : null}
    </div>
  )
}
