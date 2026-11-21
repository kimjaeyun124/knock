import { useState } from 'react'
import {
  SCENARIOS,
  SIMULATOR_SPEEDS,
  ZONE_LABELS,
  scenarioDurationSeconds,
  type SimulatorSpeed,
  type SimulatorState,
  type ZoneKind,
} from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { BatteryBadge, SensorStateBadge } from '@/components/status/DomainBadges'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AlertDialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/fields'
import { useFeatures } from '@/hooks/useFeatures'
import { formatTime } from '@/lib/format'
import { useSimulatorAction, useSimulatorState } from './hooks'
import { LastSendCard, RecentSendsCard } from './SendResult'
import { SendOptions } from './SendOptions'
import { DEFAULT_SEND_SETTINGS, toMotionOptions, type SendSettings } from './sendSettings'

const BATTERY_PRESETS = [90, 18, 9] as const

function describeScenarioLength(seconds: number): string {
  if (seconds < 60) return `약 ${seconds}초`
  return `약 ${Math.round(seconds / 60)}분`
}

function SensorsCard({ state }: { state: SimulatorState }) {
  const [send, setSend] = useState<SendSettings>(DEFAULT_SEND_SETTINGS)
  const [batteryText, setBatteryText] = useState<Record<string, string>>({})
  const [removing, setRemoving] = useState<ZoneKind | null>(null)
  const ensure = useSimulatorAction((api, zone: ZoneKind | undefined) => api.ensureSensors(zone))
  const remove = useSimulatorAction((api, zone: ZoneKind) => api.removeSensor(zone))
  const motion = useSimulatorAction((api, zone: ZoneKind) => {
    const options = toMotionOptions(send)
    if (!options) return Promise.reject(new Error('건수를 2~20 사이의 정수로 입력해 주세요.'))
    return api.motion(zone, options)
  })
  const battery = useSimulatorAction((api, v: { zone: ZoneKind; percent: number }) =>
    api.setBattery(v.zone, v.percent),
  )
  const silence = useSimulatorAction(
    (api, v: { zone: ZoneKind; silenced: boolean; fastForward?: boolean }) =>
      api.setSilenced(v.zone, v.silenced, v.fastForward),
  )
  const missing = state.sensors.some((s) => s.sensor === null)
  const error = ensure.error ?? remove.error ?? motion.error ?? battery.error ?? silence.error

  return (
    <Card title="시뮬레이션 센서">
      <div className="space-y-4">
        {missing ? (
          <div>
            <Button onClick={() => ensure.mutate(undefined)} disabled={ensure.isPending}>
              {ensure.isPending ? '만드는 중…' : '시뮬레이션 센서 만들기'}
            </Button>
            <p className="mt-1 text-sm text-ink-muted">
              세 구역에 시뮬레이션 센서를 만들고 연결합니다. 구역마다 따로 만들 수도 있습니다.
              재생·버튼을 쓰면 자동으로도 만들어집니다.
            </p>
          </div>
        ) : null}

        <SendOptions value={send} onChange={setSend} />

        <ul className="space-y-3">
          {state.sensors.map(({ zone, sensor, silenced, batteryPercent }) => (
            <li key={zone} className="rounded-control border border-line p-3">
              <p className="font-semibold">{ZONE_LABELS[zone]}</p>
              {sensor ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <SensorStateBadge state={sensor.state} />
                  <BatteryBadge level={sensor.batteryLevel} percent={sensor.batteryPercent} />
                  {silenced ? <StatusBadge tone="warn">신호를 보내지 않는 중</StatusBadge> : null}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">아직 만들지 않았습니다.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {sensor ? null : (
                  <Button
                    variant="secondary"
                    aria-label={`${ZONE_LABELS[zone]} 센서 만들기`}
                    disabled={ensure.isPending}
                    onClick={() => ensure.mutate(zone)}
                  >
                    이 구역에 센서 만들기
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={motion.isPending}
                  onClick={() => motion.mutate(zone)}
                >
                  움직임 보내기
                </Button>
                {BATTERY_PRESETS.map((percent) => (
                  <Button
                    key={percent}
                    variant="secondary"
                    aria-pressed={batteryPercent === percent}
                    disabled={battery.isPending}
                    onClick={() => battery.mutate({ zone, percent })}
                  >
                    배터리 {percent}%
                  </Button>
                ))}
                <Button
                  variant="secondary"
                  disabled={silence.isPending}
                  onClick={() => silence.mutate({ zone, silenced: !silenced })}
                >
                  {silenced ? '연결 복구' : '연결 끊기'}
                </Button>
                {silenced ? null : (
                  <Button
                    variant="secondary"
                    aria-label={`${ZONE_LABELS[zone]} 끊김 바로 확인`}
                    disabled={silence.isPending}
                    onClick={() => silence.mutate({ zone, silenced: true, fastForward: true })}
                  >
                    끊김 바로 확인
                  </Button>
                )}
                {sensor ? (
                  <Button
                    variant="ghost"
                    aria-label={`${ZONE_LABELS[zone]} 센서 연결 해제`}
                    disabled={remove.isPending}
                    onClick={() => setRemoving(zone)}
                  >
                    연결 해제
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="w-40">
                  <TextField
                    label="배터리 직접 입력 (%)"
                    type="number"
                    inputMode="numeric"
                    value={batteryText[zone] ?? ''}
                    onChange={(event) =>
                      setBatteryText((current) => ({ ...current, [zone]: event.target.value }))
                    }
                  />
                </div>
                <Button
                  variant="secondary"
                  aria-label={`${ZONE_LABELS[zone]} 배터리 값 적용`}
                  disabled={
                    battery.isPending ||
                    !/^\d{1,3}$/.test(batteryText[zone] ?? '') ||
                    Number(batteryText[zone]) > 100
                  }
                  onClick={() => battery.mutate({ zone, percent: Number(batteryText[zone]) })}
                >
                  적용
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-ink-muted">
          ‘연결 끊기’는 신호만 멈춥니다. 서버는 설정한 시간(기본 5분)이 지나야 연결 끊김으로
          판단합니다. 기다리지 않고 보려면 ‘끊김 바로 확인’을 누르세요. 신호가 오래 없었던 것처럼
          처리한 뒤 서버의 연결 점검을 바로 실행합니다.
        </p>
        {error ? (
          <p role="alert" className="text-status-danger">
            {error.message}
          </p>
        ) : null}
      </div>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="시뮬레이션 센서를 연결 해제할까요?"
        description="이 구역의 시뮬레이션 센서와 그 센서가 보낸 움직임 기록이 함께 삭제됩니다. 실제 센서에는 영향이 없습니다."
        confirmLabel="연결 해제"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (removing) remove.mutate(removing, { onSettled: () => setRemoving(null) })
        }}
      />
    </Card>
  )
}

function ScenariosCard({ state }: { state: SimulatorState }) {
  const [speed, setSpeed] = useState<SimulatorSpeed>(1)
  const run = useSimulatorAction((api, v: { id: string; speed: SimulatorSpeed }) =>
    api.runScenario(v.id, v.speed),
  )
  const stop = useSimulatorAction((api) => api.stopScenario())
  const running = state.running
  const runningScenario = running ? SCENARIOS.find((s) => s.id === running.scenarioId) : undefined
  const lastScenario = state.lastRun
    ? SCENARIOS.find((s) => s.id === state.lastRun?.scenarioId)
    : undefined

  return (
    <Card title="시나리오 재생">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="재생 배속" className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">배속</span>
          {SIMULATOR_SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={speed === value}
              onClick={() => setSpeed(value)}
              className={`min-h-12 min-w-16 rounded-control border px-4 font-semibold ${
                speed === value
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-line bg-surface text-ink-muted'
              }`}
            >
              {value}×
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          배속은 단계 사이의 기다리는 시간만 줄입니다. 서버가 판단하는 기준 시간(연결 끊김 5분 등)은
          그대로입니다.
        </p>

        {running ? (
          <Callout tone="info" title={`재생 중: ${runningScenario?.title ?? running.scenarioId}`}>
            <p>
              {running.completedSteps}/{running.totalSteps} 단계 · {running.speed}배속
            </p>
            <Button variant="secondary" onClick={() => stop.mutate()} disabled={stop.isPending}>
              멈추기
            </Button>
          </Callout>
        ) : state.lastRun ? (
          <p className="text-sm text-ink-muted" role="status">
            마지막 재생: {lastScenario?.title ?? state.lastRun.scenarioId} —{' '}
            {{ COMPLETED: '끝까지 재생함', STOPPED: '멈춤', FAILED: '실패' }[state.lastRun.outcome]}
            {state.lastRun.error ? ` (${state.lastRun.error})` : ''} ·{' '}
            {formatTime(state.lastRun.endedAt)}
          </p>
        ) : null}

        <ul className="space-y-3">
          {SCENARIOS.map((scenario) => (
            <li key={scenario.id} className="rounded-control border border-line p-3">
              <p className="font-bold">{scenario.title}</p>
              <p className="text-ink-muted">{scenario.description}</p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">기대하는 결과: </span>
                {scenario.expectation}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button
                  aria-label={`${scenario.title} 재생`}
                  disabled={running !== null || run.isPending}
                  onClick={() => run.mutate({ id: scenario.id, speed })}
                >
                  재생
                </Button>
                <span className="text-sm text-ink-muted">
                  {describeScenarioLength(Math.round(scenarioDurationSeconds(scenario) / speed))} (
                  {speed}배속)
                </span>
              </div>
            </li>
          ))}
        </ul>
        {(run.error ?? stop.error) ? (
          <p role="alert" className="text-status-danger">
            {(run.error ?? stop.error)?.message}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

function FaultCard({ state }: { state: SimulatorState }) {
  const fault = useSimulatorAction((api, enabled: boolean) => api.setDeliveryFailure(enabled))
  const on = state.deliveryFailure.enabled
  return (
    <Card title="장애 주입">
      <div className="space-y-2">
        <p>
          시뮬레이션 알림의 <span className="font-semibold">앱 화면 전달</span>을 실패시킵니다. 실제
          센서가 만든 알림에는 영향이 없습니다.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={on ? 'danger' : 'secondary'}
            aria-pressed={on}
            disabled={fault.isPending}
            onClick={() => fault.mutate(!on)}
          >
            {on ? '전달 실패 주입 끄기' : '전달 실패 주입 켜기'}
          </Button>
          {on ? (
            <StatusBadge tone="warn">
              주입 중
              {state.deliveryFailure.expiresAt
                ? ` · ${formatTime(state.deliveryFailure.expiresAt)}에 자동으로 꺼짐`
                : ''}
            </StatusBadge>
          ) : null}
        </div>
        {fault.error ? (
          <p role="alert" className="text-status-danger">
            {fault.error.message}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

export function SimulatorPage() {
  const features = useFeatures()
  const enabled = features.data?.simulatorEnabled === true
  const query = useSimulatorState(enabled)

  return (
    <div className="space-y-4">
      <h1 className="text-h1">센서 시뮬레이터</h1>
      <p className="text-body-sm text-ink-muted">
        개발자·시연 전용 화면입니다. 서버의 SIMULATOR_ENABLED 가 켜진 환경에서만 열립니다.
      </p>

      {features.isError ? (
        <ErrorState
          title="시뮬레이터 설정을 확인하지 못했습니다"
          error={features.error}
          onRetry={() => void features.refetch()}
        />
      ) : !features.data ? (
        <LoadingState />
      ) : !enabled ? (
        <Callout tone="info" title="시뮬레이터가 꺼져 있습니다">
          <p className="text-sm">
            서버의 SIMULATOR_ENABLED 설정이 꺼져 있어 이 화면을 쓸 수 없습니다. (운영 서버의
            기본값입니다)
          </p>
        </Callout>
      ) : (
        <>
          <Callout tone="warn" title="시뮬레이션입니다. 실제 센서가 아닙니다">
            <p className="text-sm">
              여기서 보내는 신호는 실제 센서와 같은 수집 API 를 거치지만 모두 "시뮬레이션"으로
              표시되고, 실제 알림과 섞이지 않습니다. 만든 데이터는{' '}
              <span className="font-semibold">설정 → 데이터 관리</span>에서 지울 수 있습니다.
            </p>
          </Callout>

          {query.isError ? (
            <ErrorState
              title="시뮬레이터 상태를 불러오지 못했습니다"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : !query.data ? (
            <LoadingState />
          ) : (
            <>
              {!query.data.night.isNightNow ? (
                <Callout tone="warn" title="지금은 야간 시간대가 아닙니다">
                  <p className="text-sm">
                    야간 시간대({query.data.night.start}–{query.data.night.end})가 아니면 움직임
                    알림은 만들어지지 않고 기록만 남습니다. 알림을 확인하려면 감지 설정에서 야간
                    시간대를 지금 시각이 포함되도록 바꿔 주세요. (민감도:{' '}
                    {query.data.night.sensitivity})
                  </p>
                </Callout>
              ) : null}
              <SensorsCard state={query.data} />
              <LastSendCard recent={query.data.recent} />
              <ScenariosCard state={query.data} />
              <FaultCard state={query.data} />
              <RecentSendsCard recent={query.data.recent} />
            </>
          )}
        </>
      )}
    </div>
  )
}
