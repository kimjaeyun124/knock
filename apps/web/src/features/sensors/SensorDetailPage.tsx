import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  SENSOR_STATE_LABELS,
  SensorUpdateSchema,
  ZONE_KINDS,
  ZONE_LABELS,
  type Sensor,
  type SensorWithTokenResponse,
  type ZoneKind,
} from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { AlertDialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { SelectField, TextField } from '@/components/ui/fields'
import { Switch } from '@/components/ui/Switch'
import { PATHS } from '@/app/paths'
import { useEventPages } from '@/features/events/hooks'
import { formatClock, formatDateTime, formatRelative } from '@/lib/format'
import { useDeleteSensor, useRotateSensorToken, useSensor, useUpdateSensor } from './hooks'
import { describeSensorError, type SensorErrorInfo } from './sensorErrors'
import { SENSOR_KIND_LABELS, sensorDisplayStatus } from './sensorStatus'
import { SensorErrorNotice } from './SensorErrorNotice'
import { SensorHealthNotes } from './SensorHealthNotes'
import { formatSilence } from './sensorHealth'
import { BatteryWarning, SensorStatusBadges } from './SensorStatusBadges'
import { TokenReveal } from './TokenReveal'
import { ZONE_HINTS } from './zoneHints'

type SensorQuery = ReturnType<typeof useSensor>

/**
 * 연결 상태 확인. 서버가 마지막으로 받은 신호를 기준으로 상태를 다시 읽어 알려 준다.
 * (센서에 직접 신호를 보내 확인하는 것이 아니다. 이 점을 화면에서도 밝힌다)
 */
function ConnectionCheck({ sensor, query }: { sensor: Sensor; query: SensorQuery }) {
  const [result, setResult] = useState<{ at: Date; label: string } | null>(null)
  const [failure, setFailure] = useState<SensorErrorInfo | null>(null)

  const check = async () => {
    setFailure(null)
    const fresh = await query.refetch()
    if (fresh.isError || !fresh.data) {
      setResult(null)
      setFailure(describeSensorError(fresh.error))
      return
    }
    const latest = fresh.data.sensor
    const status = sensorDisplayStatus(latest)
    setResult({
      at: new Date(),
      label: status === 'DISABLED' ? '사용 안 함' : SENSOR_STATE_LABELS[latest.state],
    })
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        loading={query.isFetching}
        loadingText="확인하는 중…"
        onClick={() => void check()}
      >
        연결 상태 확인
      </Button>
      <p className="text-body-sm text-ink-muted">
        서버가 {sensor.name}에게서 마지막으로 받은 신호를 기준으로 판단합니다. 센서에 직접 신호를
        보내 확인하는 것은 아닙니다.
      </p>
      {result ? (
        <p role="status" className="text-body font-semibold">
          {formatClock(result.at)}에 확인했습니다: {result.label}
        </p>
      ) : null}
      {failure ? (
        <SensorErrorNotice error={failure} headline="연결 상태를 확인하지 못했습니다." />
      ) : null}
    </div>
  )
}

/** 사용 여부. 끄는 것은 모니터링에서 빠지는 중요한 변경이라 한 번 더 확인한다. 켜는 것은 바로 한다. */
function ActiveSwitch({ sensor }: { sensor: Sensor }) {
  const update = useUpdateSensor(sensor.id)
  const [confirmOff, setConfirmOff] = useState(false)
  const failure = update.isError ? describeSensorError(update.error) : null

  return (
    <div className="space-y-2">
      <Switch
        label="이 센서 사용"
        description={
          sensor.isActive
            ? '켜져 있습니다. 이 센서의 신호로 움직임을 확인합니다.'
            : '꺼져 있습니다. 신호를 받지 않고 모니터링에서 빠져 있습니다.'
        }
        checked={sensor.isActive}
        disabled={update.isPending}
        onCheckedChange={(next) => {
          if (next) update.mutate({ isActive: true })
          else setConfirmOff(true)
        }}
      />
      {update.isPending ? (
        <p role="status" className="text-body-sm text-ink-muted">
          저장하는 중…
        </p>
      ) : null}
      {failure ? (
        <SensorErrorNotice
          error={failure}
          headline="사용 여부를 바꾸지 못해 이전 상태로 되돌렸습니다."
        />
      ) : null}
      <AlertDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="이 센서 사용을 끌까요?"
        description="끄면 이 센서의 신호를 받지 않고, 모니터링에서 빠집니다. 연결 끊김·배터리 경고도 만들지 않습니다. 언제든 다시 켤 수 있습니다."
        confirmLabel="사용 끄기"
        loading={update.isPending}
        onConfirm={() =>
          update.mutate({ isActive: false }, { onSettled: () => setConfirmOff(false) })
        }
      />
    </div>
  )
}

function SummaryCard({ sensor, query }: { sensor: Sensor; query: SensorQuery }) {
  return (
    <Card>
      <h2 className="text-h2">{sensor.name}</h2>
      <p className="text-body text-ink-muted">
        {ZONE_LABELS[sensor.zone]} · {SENSOR_KIND_LABELS[sensor.kind]}
      </p>
      <div className="mt-3 space-y-2">
        <SensorStatusBadges sensor={sensor} />
        <BatteryWarning sensor={sensor} />
        <SensorHealthNotes sensor={sensor} />
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        <dt className="text-ink-muted">마지막 통신</dt>
        <dd>
          {sensor.lastSeenAt
            ? `${formatRelative(sensor.lastSeenAt)} (${formatDateTime(sensor.lastSeenAt)})`
            : '아직 받지 못했습니다'}
        </dd>
        <dt className="text-ink-muted">마지막 heartbeat</dt>
        <dd>
          {sensor.lastHeartbeatAt
            ? `${formatRelative(sensor.lastHeartbeatAt)} (${formatDateTime(sensor.lastHeartbeatAt)})`
            : '받은 적 없음 (움직임 신호만 받았거나 아직 신호가 없습니다)'}
        </dd>
        <dt className="text-ink-muted">연결 끊김 기준</dt>
        <dd>
          {formatSilence(sensor.effectiveOfflineAfterSeconds)} 동안 신호가 없으면{' '}
          {sensor.offlineAfterSeconds === null ? '(가구 기본)' : '(이 센서에만 정한 값)'}
        </dd>
        <dt className="text-ink-muted">배터리</dt>
        <dd>
          {sensor.batteryPercent === null
            ? '알 수 없음 (센서가 배터리 정보를 보내지 않았습니다)'
            : `${sensor.batteryPercent}%`}
        </dd>
        <dt className="text-ink-muted">펌웨어</dt>
        <dd>{sensor.firmwareVersion ?? '알 수 없음'}</dd>
        <dt className="text-ink-muted">등록</dt>
        <dd>{formatDateTime(sensor.createdAt)}</dd>
      </dl>
      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <ConnectionCheck sensor={sensor} query={query} />
        <ActiveSwitch sensor={sensor} />
      </div>
    </Card>
  )
}

/**
 * 이름·설치 구역 수정. 저장에 실패하면 입력칸을 저장 전 값으로 되돌리고, 원인과 해결 방법을 알린다.
 * (화면과 서버의 값이 달라진 채로 남지 않게 한다)
 */
function EditCard({ sensor }: { sensor: Sensor }) {
  const update = useUpdateSensor(sensor.id)
  const [name, setName] = useState(sensor.name)
  const [zone, setZone] = useState<ZoneKind>(sensor.zone)
  const [nameError, setNameError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'saved' | { failure: SensorErrorInfo } | null>(null)

  const dirty = name !== sensor.name || zone !== sensor.zone

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setOutcome(null)
    const parsed = SensorUpdateSchema.safeParse({ name, zone })
    if (!parsed.success) {
      setNameError('센서 이름을 1~50자로 입력해 주세요.')
      return
    }
    setNameError(null)
    // 저장 전 값을 기억해 두었다가, 실패하면 입력칸을 그 값으로 되돌린다.
    const before = { name: sensor.name, zone: sensor.zone }
    update.mutate(parsed.data, {
      onSuccess: () => setOutcome('saved'),
      onError: (error) => {
        setName(before.name)
        setZone(before.zone)
        setOutcome({ failure: describeSensorError(error) })
      },
    })
  }

  return (
    <Card title="이름과 설치 위치">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="센서 이름"
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
        <p className="text-body-sm text-ink-muted">
          구역을 바꿔도 이미 기록된 신호는 기록 당시의 구역으로 남습니다.
        </p>
        <Button
          type="submit"
          disabled={!dirty}
          loading={update.isPending}
          loadingText="저장하는 중…"
        >
          저장
        </Button>
        {outcome === 'saved' ? <p role="status">저장했습니다.</p> : null}
        {outcome && outcome !== 'saved' ? (
          <SensorErrorNotice
            error={outcome.failure}
            headline="저장하지 못해 이전 이름과 구역으로 되돌렸습니다."
          />
        ) : null}
      </form>
    </Card>
  )
}

/**
 * 이 센서의 연결 끊김 기준. 신호를 보내는 간격은 센서마다 다르므로(배터리 센서는 간격이 길다)
 * 가구 기본(설정)과 다르게 정할 수 있다. 비우면 가구 기본을 따른다.
 */
function TimeoutCard({ sensor }: { sensor: Sensor }) {
  const update = useUpdateSensor(sensor.id)
  const [text, setText] = useState(
    sensor.offlineAfterSeconds === null ? '' : String(Math.round(sensor.offlineAfterSeconds / 60)),
  )
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'saved' | { failure: SensorErrorInfo } | null>(null)
  const current = sensor.offlineAfterSeconds === null ? '' : String(sensor.offlineAfterSeconds / 60)
  const dirty = text.trim() !== current

  const save = () => {
    setOutcome(null)
    let seconds: number | null = null
    if (text.trim() !== '') {
      const minutes = Number(text)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
        setError('1~60분 사이의 정수로 입력하거나, 비워 두면 가구 기본을 따릅니다.')
        return
      }
      seconds = minutes * 60
    }
    setError(null)
    update.mutate(
      { offlineAfterSeconds: seconds },
      {
        onSuccess: () => setOutcome('saved'),
        onError: (cause) => {
          setText(current)
          setOutcome({ failure: describeSensorError(cause) })
        },
      },
    )
  }

  return (
    <Card
      title="연결 끊김 기준"
      description="신호가 이 시간 동안 없으면 연결이 끊긴 것으로 보고 알립니다."
    >
      <div className="space-y-3">
        <TextField
          label="이 센서의 기준 (분)"
          hint={`비워 두면 가구 기본을 따릅니다. 지금 적용되는 값: ${formatSilence(sensor.effectiveOfflineAfterSeconds)}. 신호 간격이 긴 센서는 더 길게 정하세요. (1–60)`}
          type="number"
          inputMode="numeric"
          value={text}
          error={error}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!dirty}
            loading={update.isPending}
            loadingText="저장하는 중…"
            onClick={save}
          >
            기준 저장
          </Button>
          {sensor.offlineAfterSeconds !== null ? (
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => {
                setText('')
                setOutcome(null)
                update.mutate(
                  { offlineAfterSeconds: null },
                  { onSuccess: () => setOutcome('saved') },
                )
              }}
            >
              가구 기본으로 되돌리기
            </Button>
          ) : null}
        </div>
        {outcome === 'saved' ? <p role="status">저장했습니다.</p> : null}
        {outcome && outcome !== 'saved' ? (
          <SensorErrorNotice
            error={outcome.failure}
            headline="저장하지 못해 이전 값으로 되돌렸습니다."
          />
        ) : null}
      </div>
    </Card>
  )
}

/** 토큰 재발급과 연결 해제. 둘 다 되돌리기 어려워 확인 대화상자를 거친다. */
function ManageCard({ sensor }: { sensor: Sensor }) {
  const navigate = useNavigate()
  const update = useUpdateSensor(sensor.id)
  const rotate = useRotateSensorToken(sensor.id)
  const remove = useDeleteSensor(sensor.id)
  const [dialog, setDialog] = useState<'rotate' | 'disconnect' | null>(null)
  const [newToken, setNewToken] = useState<SensorWithTokenResponse | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectFailure, setDisconnectFailure] = useState<{
    info: SensorErrorInfo
    headline: string
  } | null>(null)

  /**
   * 연결 해제 = 센서 삭제. 서버는 사용 중인 센서를 지우지 못하게 하므로, 켜져 있으면 먼저 끈 다음 삭제한다.
   * 중간에 실패하면 어디까지 되었는지 그대로 알린다.
   */
  const disconnect = async () => {
    setDisconnecting(true)
    setDisconnectFailure(null)
    let phase: 'deactivate' | 'delete' = 'deactivate'
    try {
      if (sensor.isActive) await update.mutateAsync({ isActive: false })
      phase = 'delete'
      await remove.mutateAsync()
      void navigate(PATHS.sensors)
    } catch (error) {
      setDisconnectFailure({
        info: describeSensorError(error),
        headline:
          phase === 'deactivate'
            ? '센서 사용을 끄지 못해 연결 해제를 멈췄습니다. 센서는 그대로입니다.'
            : '센서 사용은 꺼졌지만 삭제하지 못했습니다. 기록은 지워지지 않았습니다.',
      })
      setDialog(null)
    } finally {
      setDisconnecting(false)
    }
  }

  const rotateFailure = rotate.isError ? describeSensorError(rotate.error) : null

  return (
    <Card title="관리">
      <div className="space-y-5">
        <div>
          <Button variant="secondary" onClick={() => setDialog('rotate')}>
            토큰 재발급
          </Button>
          <p className="mt-1 text-body-sm text-ink-muted">
            센서가 서버에 신호를 보낼 때 쓰는 비밀 값을 새로 만듭니다.
          </p>
          {rotateFailure ? (
            <SensorErrorNotice error={rotateFailure} headline="새 토큰을 발급하지 못했습니다." />
          ) : null}
        </div>
        {newToken ? <TokenReveal token={newToken.deviceToken} title="새 장치 토큰" /> : null}

        <div className="border-t border-line pt-5">
          <Button variant="danger" onClick={() => setDialog('disconnect')}>
            센서 연결 해제
          </Button>
          <p className="mt-1 text-body-sm text-ink-muted">
            센서를 삭제하고 이 센서의 움직임 기록을 모두 지웁니다.
          </p>
          {disconnectFailure ? (
            <SensorErrorNotice
              error={disconnectFailure.info}
              headline={disconnectFailure.headline}
            />
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={dialog === 'rotate'}
        onOpenChange={(open) => setDialog(open ? 'rotate' : null)}
        title="새 토큰을 발급할까요?"
        description="새 토큰을 발급하면 기존 토큰은 바로 쓸 수 없게 되고, 센서에 새 토큰을 입력할 때까지 신호를 받지 못합니다."
        confirmLabel="새 토큰 발급"
        loading={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(undefined, {
            onSuccess: (result) => setNewToken(result),
            onSettled: () => setDialog(null),
          })
        }
      />
      <AlertDialog
        open={dialog === 'disconnect'}
        onOpenChange={(open) => setDialog(open ? 'disconnect' : null)}
        title="센서 연결을 해제할까요?"
        tone="danger"
        description={
          <>
            “{sensor.name}” 센서를 삭제하고 이 센서가 보낸 움직임 기록을 모두 지웁니다.{' '}
            <strong>되돌릴 수 없습니다.</strong> 다시 쓰려면 센서를 새로 등록해야 합니다.
          </>
        }
        confirmLabel="연결 해제"
        loading={disconnecting}
        onConfirm={() => void disconnect()}
      />
    </Card>
  )
}

function RecentSignals({ sensorId }: { sensorId: string }) {
  const query = useEventPages({ sensorId, limit: 10 })
  const events = query.data?.pages[0]?.events ?? []
  return (
    <Card title="최근 신호">
      {query.isError ? (
        <ErrorState
          title="신호 기록을 불러오지 못했습니다"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <LoadingState />
      ) : events.length === 0 ? (
        <p className="text-ink-muted">받은 움직임 신호가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center gap-x-3 py-2">
              <span className="font-semibold">{formatDateTime(event.occurredAt)}</span>
              <span className="text-ink-muted">{ZONE_LABELS[event.zone]}</span>
              {event.isLate ? <span className="text-sm text-ink-muted">지연 수신</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function SensorDetailPage() {
  const { sensorId = '' } = useParams()
  const query = useSensor(sensorId)
  const sensor = query.data?.sensor

  return (
    <div className="space-y-4">
      <h1 className="text-h1">센서 상세</h1>
      {query.isError && !sensor ? (
        <ErrorState
          title="센서를 불러오지 못했습니다"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : sensor ? (
        <div className="space-y-4">
          {query.isError ? (
            <Callout tone="warn" title="최신 정보를 불러오지 못했습니다">
              <p className="text-body-sm">화면의 내용은 마지막으로 받은 정보입니다.</p>
            </Callout>
          ) : null}
          <SummaryCard sensor={sensor} query={query} />
          <RecentSignals sensorId={sensor.id} />
          <EditCard sensor={sensor} />
          <TimeoutCard sensor={sensor} />
          <ManageCard sensor={sensor} />
        </div>
      ) : (
        <LoadingState label="센서를 불러오는 중" />
      )}
    </div>
  )
}
