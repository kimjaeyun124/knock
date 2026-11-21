import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ALERT_CLIP_LIMITS,
  SENSITIVITY_LABELS,
  ZONE_LABELS,
  ZoneKindSchema,
  type Sensitivity,
  type SimulatorState,
  type ZoneKind,
} from '@tetris/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { SelectField } from '@/components/ui/fields'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useFeatures } from '@/hooks/useFeatures'
import { LastSendCard } from '../simulator/SendResult'
import { useSimulatorAction, useSimulatorState } from '../simulator/hooks'
import {
  DEFAULT_MOTION_SENSITIVITY,
  MOTION_SENSITIVITIES,
  MOTION_SENSITIVITY_LABELS,
  motionRule,
  type MotionSensitivity,
} from './motionDetector'
import { useWebcamMotion } from './useWebcamMotion'

/** 화면을 3구역으로 나눌 때, 화면에 보이는 왼쪽부터의 구역 */
const SPLIT_ZONES = ['BED_SIDE', 'PATH', 'ENTRANCE'] as const satisfies readonly ZoneKind[]

type Layout = 'split' | 'single'

function Meter({ label, ratio, threshold }: { label: string; ratio: number; threshold: number }) {
  const percent = Math.min(100, Math.round(ratio * 1000) / 10)
  const over = ratio >= threshold
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {label} 변화 {percent}%
        </span>
        <StatusBadge tone={over ? 'warn' : 'muted'}>
          {over ? '움직임이 보입니다' : '움직임 없음'}
        </StatusBadge>
      </div>
      {/* 막대는 눈으로 보는 보조 표시다. 같은 정보가 위의 글자로도 있다. */}
      <div aria-hidden="true" className="relative h-3 overflow-hidden rounded-full bg-line">
        <div
          className={over ? 'h-full bg-status-warn' : 'h-full bg-brand'}
          style={{ width: `${Math.min(100, (ratio / (threshold * 2)) * 100)}%` }}
        />
      </div>
    </div>
  )
}

/** 구역마다 이 화면의 움직임이 알림이 되는지 그 이유까지 알려 준다. (알림이 안 오는 이유를 숨기지 않는다) */
function alertOutlook(
  zone: ZoneKind,
  sensitivity: Sensitivity,
  isNight: boolean,
): { tone: 'ok' | 'muted'; text: string } {
  if (!isNight) {
    return {
      tone: 'muted',
      text: '지금은 야간 시간으로 보내지 않아 기록만 남고 알림은 만들어지지 않습니다.',
    }
  }
  if (zone === 'ENTRANCE') {
    return { tone: 'ok', text: '움직임이 확정되면 "즉시 확인 권장" 알림이 만들어집니다.' }
  }
  if (zone === 'BED_SIDE') {
    return sensitivity === 'HIGH'
      ? { tone: 'ok', text: '움직임이 확정되면 "확인 필요" 알림이 만들어집니다.' }
      : {
          tone: 'muted',
          text: `기록만 남습니다. 침대 주변 움직임 하나만으로는 민감도가 "${SENSITIVITY_LABELS.HIGH}"일 때만 알려, 뒤척임으로 알림이 쌓이지 않게 합니다. (지금 민감도: ${SENSITIVITY_LABELS[sensitivity]})`,
        }
  }
  return sensitivity === 'LOW'
    ? {
        tone: 'muted',
        text: '기록만 남습니다. (지금 민감도 "낮음"에서는 이동 경로 알림이 없습니다)',
      }
    : {
        tone: 'muted',
        text: '이 구역만으로는 알림이 없습니다. 직전에 침대 주변 움직임이 있고 이어서 이 구역에서 움직임이 확정되면 "확인 필요" 알림이 만들어집니다.',
      }
}

function WebcamPanel() {
  const query = useSimulatorState(true)
  const ensure = useSimulatorAction((api, zone: ZoneKind | undefined) => api.ensureSensors(zone))
  // 신호 전송 오류. 칸마다 따로 보내므로(공용 mutation 을 쓰면 먼저 보낸 칸의 완료 처리가 사라진다) 직접 관리한다.
  const [sendError, setSendError] = useState<Error | null>(null)
  const [layout, setLayout] = useState<Layout>('split')
  const [zone, setZone] = useState<ZoneKind>('ENTRANCE')
  const [sensitivity, setSensitivity] = useState<MotionSensitivity>(DEFAULT_MOTION_SENSITIVITY)
  // 지금이 야간이 아니면 처음부터 "야간 시간으로 보내기"를 켜 둔다. 직접 바꾸면 그 선택을 따른다.
  const [nightChoice, setNightChoice] = useState<boolean | null>(null)
  const isNightNow = query.data?.night.isNightNow ?? true
  const night = nightChoice ?? !isNightNow
  const [hidePreview, setHidePreview] = useState(false)
  const [detected, setDetected] = useState(0)
  // 알림이 새로 만들어지면 그 순간부터 짧게 녹화한 영상을 알림에 붙인다. (끄면 영상은 브라우저 밖으로 나가지 않는다)
  const [attachClip, setAttachClip] = useState(true)
  const [clipNote, setClipNote] = useState<{ ok: boolean; text: string } | null>(null)
  const api = useApi()
  const queryClient = useQueryClient()

  const zones = useMemo<readonly ZoneKind[]>(
    () => (layout === 'split' ? SPLIT_ZONES : [zone]),
    [layout, zone],
  )
  // 칸마다의 판정 기준: 침대 주변은 엄격하게, 이동 경로·현관은 더 예민하게
  const rules = useMemo(() => zones.map((z) => motionRule(z, sensitivity)), [zones, sensitivity])
  const householdSensitivity: Sensitivity = query.data?.night.sensitivity ?? 'MEDIUM'

  // 같은 구역으로 신호를 보내는 중에 또 확정되어도 쌓아 두지 않고 건너뛴다.
  const sending = useRef(new Set<ZoneKind>())
  const settings = useRef({ zones, night, attachClip })
  useEffect(() => {
    settings.current = { zones, night, attachClip }
  }, [zones, night, attachClip])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recordClipRef = useRef<(ms: number) => Promise<Blob | null>>(() => Promise.resolve(null))

  /** 이 신호로 새 알림이 만들어졌으면 녹화한 영상을 그 알림에 붙인다. 알림이 없으면 영상은 버린다. */
  const attachToNewAlerts = useCallback(
    async (state: SimulatorState, target: ZoneKind, clip: Promise<Blob | null>) => {
      const result = state.recent.find((r) => r.zone === target)
      const alerts = result?.newAlerts ?? []
      if (alerts.length === 0) return
      const video = await clip
      if (!video) {
        setClipNote({ ok: false, text: '이 브라우저에서 영상을 녹화하지 못해 알림만 보냈습니다.' })
        return
      }
      try {
        for (const alert of alerts) {
          await api.simulator.uploadClip(alert.id, video, ALERT_CLIP_LIMITS.recordMs)
        }
        setClipNote({
          ok: true,
          text: `${ZONE_LABELS[target]} 알림 ${alerts.length}건에 영상(약 ${ALERT_CLIP_LIMITS.recordMs / 1000}초)을 붙였습니다. 알림 상세에서 볼 수 있습니다.`,
        })
        void queryClient.invalidateQueries({ queryKey: ['alerts', 'clips'] })
      } catch (error) {
        setClipNote({
          ok: false,
          text: `알림은 만들어졌지만 영상을 붙이지 못했습니다. ${error instanceof Error ? error.message : ''}`,
        })
      }
    },
    [api, queryClient],
  )

  const onMotion = useCallback((region: number) => {
    setDetected((n) => n + 1)
    const target = settings.current.zones[region]
    if (!target || sending.current.has(target)) return
    sending.current.add(target)
    // 알림이 될지는 서버가 정하므로, 녹화는 신호를 보내는 것과 함께 바로 시작한다.
    const clip = settings.current.attachClip
      ? recordClipRef.current(ALERT_CLIP_LIMITS.recordMs)
      : null
    // 칸마다 독립적으로 보낸다. 여러 칸이 거의 동시에 보내도 각자의 완료 처리가 반드시 실행된다.
    api.simulator
      .motion(target, { mode: 'single', when: settings.current.night ? 'night' : 'now' })
      .then((state) => {
        setSendError(null)
        queryClient.setQueryData(queryKeys.simulator, state)
        void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
        if (clip) void attachToNewAlerts(state, target, clip)
      })
      .catch((error: unknown) => {
        setSendError(error instanceof Error ? error : new Error('신호를 보내지 못했습니다.'))
      })
      .finally(() => {
        sending.current.delete(target)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const camera = useWebcamMotion({ rules, onMotion, videoRef })
  useEffect(() => {
    recordClipRef.current = camera.recordClip
  }, [camera.recordClip])
  const running = camera.state === 'running'
  const busy = camera.state === 'starting' || ensure.isPending
  const bedRule = motionRule('BED_SIDE', sensitivity)
  const passageRule = motionRule('ENTRANCE', sensitivity)
  const secondsOf = (frames: number) => Math.round(frames * 0.15 * 10) / 10

  const begin = async () => {
    setDetected(0)
    // 신호를 받을 시뮬레이션 센서가 없으면 만든다. (나눠 보면 세 구역 모두, 한 구역이면 그 구역만)
    try {
      await ensure.mutateAsync(layout === 'split' ? undefined : zone)
    } catch {
      return
    }
    await camera.start()
  }

  const shownError = sendError ?? ensure.error

  return (
    <>
      {attachClip ? (
        <Callout tone="warn" title="알림이 생기면 그 순간의 짧은 영상만 서버로 보냅니다">
          <p className="text-sm">
            움직임 판단은 이 브라우저 안에서 작게 줄인 흑백 화면으로 합니다. "영상 함께 보내기"가
            켜져 있으면 <span className="font-semibold">새 알림이 만들어졌을 때만</span> 그 순간부터
            약 {ALERT_CLIP_LIMITS.recordMs / 1000}초를 녹화해 서버에 저장하고, 로그인한 보호자만
            알림 상세에서 볼 수 있습니다. {ALERT_CLIP_LIMITS.retentionDays}일이 지나면 자동으로
            지워지고, 알림이 되지 않은 움직임의 영상은 저장하지 않습니다. 소리(마이크)는 쓰지
            않습니다.
          </p>
        </Callout>
      ) : (
        <Callout tone="ok" title="카메라 영상은 이 브라우저 안에서만 처리합니다">
          <p className="text-sm">
            영상을 저장하거나 서버로 보내지 않습니다. 작게 줄인 흑백 화면의 앞뒤를 비교해 움직임이
            있었는지만 계산하고, 서버에는 "움직임이 있었다"는 신호(구역·시각)만 보냅니다. 마이크는
            쓰지 않습니다.
          </p>
        </Callout>
      )}
      <p className="text-body-sm text-ink-muted">
        이 화면을 떠나거나 "카메라 끄기"를 누르면 카메라가 꺼집니다.
      </p>

      <Card title="카메라">
        <div className="space-y-4">
          <SelectField
            label="화면 나누기"
            hint="카메라 화면을 구역으로 나누면, 침대 쪽에서 뒤척이는 것과 침대를 떠나 걸어가는 것을 구분해 신호를 보낼 수 있습니다."
            value={layout}
            disabled={running}
            onChange={(event) => setLayout(event.target.value as Layout)}
          >
            <option value="split">
              3구역으로 나누기 (화면 왼쪽 침대 주변 · 가운데 이동 경로 · 오른쪽 현관)
            </option>
            <option value="single">화면 전체를 한 구역으로</option>
          </SelectField>
          <div className="grid gap-3 sm:grid-cols-2">
            {layout === 'single' ? (
              <SelectField
                label="이 카메라가 보는 구역"
                hint="움직임이 보이면 이 구역의 시뮬레이션 센서가 신호를 보냅니다."
                value={zone}
                disabled={running}
                onChange={(event) => setZone(ZoneKindSchema.parse(event.target.value))}
              >
                {ZoneKindSchema.options.map((z) => (
                  <option key={z} value={z}>
                    {ZONE_LABELS[z]}
                  </option>
                ))}
              </SelectField>
            ) : null}
            <SelectField
              label="움직임 민감도"
              hint={`기본은 "낮음"입니다. 침대 주변은 칸의 ${Math.round(bedRule.threshold * 100)}%가 평균 ${secondsOf(bedRule.minFrames)}초, 이동 경로·현관은 ${Math.round(passageRule.threshold * 100)}%가 ${secondsOf(passageRule.minFrames)}초 동안 달라져야 움직임으로 봅니다.`}
              value={sensitivity}
              onChange={(event) => setSensitivity(event.target.value as MotionSensitivity)}
            >
              {MOTION_SENSITIVITIES.map((value) => (
                <option key={value} value={value}>
                  {MOTION_SENSITIVITY_LABELS[value]}
                </option>
              ))}
            </SelectField>
          </div>

          <label className="flex min-h-12 items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-brand"
              checked={night}
              onChange={(event) => setNightChoice(event.target.checked)}
            />
            <span>
              <span className="block font-semibold">가장 최근의 야간 시간으로 보내기</span>
              <span className="block text-body-sm text-ink-muted">
                {isNightNow
                  ? '지금은 야간 시간대라 켜지 않아도 알림 규칙이 적용됩니다.'
                  : '지금은 야간 시간대가 아니라서 켜 두었습니다. 끄면 기록만 남고 알림은 만들어지지 않습니다.'}{' '}
                서버는 "늦게 도착한 신호"로 표시합니다.
              </span>
            </span>
          </label>

          <label className="flex min-h-12 items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-brand"
              checked={attachClip}
              onChange={(event) => setAttachClip(event.target.checked)}
            />
            <span>
              <span className="block font-semibold">
                알림이 생기면 그 순간의 영상(약 {ALERT_CLIP_LIMITS.recordMs / 1000}초)을 함께 보내기
              </span>
              <span className="block text-body-sm text-ink-muted">
                새 알림이 만들어졌을 때만 서버에 저장되어 알림 상세에서 볼 수 있고,{' '}
                {ALERT_CLIP_LIMITS.retentionDays}일 뒤 자동으로 지워집니다. 알림이 되지 않은
                움직임의 영상은 저장하지 않습니다.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <Button variant="secondary" onClick={camera.stop}>
                카메라 끄기
              </Button>
            ) : (
              <Button onClick={() => void begin()} disabled={busy}>
                {busy ? '시작하는 중…' : '카메라 시작'}
              </Button>
            )}
            <StatusBadge tone={running ? 'ok' : 'muted'}>
              {running ? '카메라 켜짐' : '카메라 꺼짐'}
            </StatusBadge>
            {attachClip ? <StatusBadge tone="warn">알림에 영상 첨부 켜짐</StatusBadge> : null}
          </div>

          {camera.message ? (
            <p role="alert" className="font-semibold text-status-danger">
              {camera.message}
            </p>
          ) : null}
          {shownError ? (
            <p role="alert" className="font-semibold text-status-danger">
              {shownError.message}
            </p>
          ) : null}

          <div className={running ? 'space-y-3' : 'hidden'}>
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-brand"
                checked={hidePreview}
                onChange={(event) => setHidePreview(event.target.checked)}
              />
              <span className="font-semibold">미리보기 숨기기 (움직임 감지는 계속합니다)</span>
            </label>
            {/* 미리보기 영상은 이 화면에만 보인다. 서버로는 "영상 함께 보내기"가 켜져 있고 알림이 생겼을 때의 짧은 영상만 간다. */}
            <div className={hidePreview ? 'hidden' : 'relative aspect-[4/3] w-full max-w-sm'}>
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="카메라 미리보기"
                className="absolute inset-0 size-full -scale-x-100 rounded-control bg-line object-cover"
              />
              {layout === 'split' ? (
                <div aria-hidden="true" className="absolute inset-0 grid grid-cols-3">
                  {SPLIT_ZONES.map((z, index) => (
                    <div
                      key={z}
                      className={
                        index > 0
                          ? 'flex items-end justify-center border-l-2 border-dashed border-white/80 pb-2'
                          : 'flex items-end justify-center pb-2'
                      }
                    >
                      <span className="rounded-full bg-ink px-2 py-0.5 text-caption font-semibold text-ink-inverse">
                        {ZONE_LABELS[z]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {zones.map((z, index) => (
              <Meter
                key={z}
                label={ZONE_LABELS[z]}
                ratio={camera.ratios[index] ?? 0}
                threshold={rules[index]?.threshold ?? 1}
              />
            ))}
            <p className="text-caption text-ink-muted">
              침대 주변은 뒤척임을 거르려고 엄격하게(칸의 {Math.round(bedRule.threshold * 100)}%,{' '}
              {secondsOf(bedRule.minFrames)}초), 이동 경로·현관은 사람이 지나가는 곳이라 더
              예민하게(
              {Math.round(passageRule.threshold * 100)}%, {secondsOf(passageRule.minFrames)}초)
              봅니다.
            </p>
            {clipNote ? (
              <p
                role="status"
                className={clipNote.ok ? 'font-semibold' : 'font-semibold text-status-danger'}
              >
                {clipNote.text}
              </p>
            ) : null}
            <p role="status" className="font-semibold">
              지금까지 움직임 {detected}번 감지
            </p>
          </div>
        </div>
      </Card>

      <Card title="이 화면의 움직임이 알림이 되는 경우">
        <ul className="space-y-2">
          {zones.map((z) => {
            const outlook = alertOutlook(z, householdSensitivity, isNightNow || night)
            return (
              <li key={z} className="flex flex-wrap items-start gap-2">
                <span className="font-semibold">{ZONE_LABELS[z]}</span>
                <StatusBadge tone={outlook.tone} size="sm">
                  {outlook.tone === 'ok' ? '알림 생김' : '기록만'}
                </StatusBadge>
                <span className="basis-full text-body-sm text-ink-muted">{outlook.text}</span>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-body-sm text-ink-muted">
          알림은 이 노크 화면이 열려 있을 때 위쪽 배너로 뜨고, 소리는 헤더의 "알림 소리"를 켜야
          납니다. 침대 → 이동 경로 순서의 움직임은 "확인 필요", 현관 움직임은 "즉시 확인 권장"
          알림이 됩니다. 규칙은 설정 → 감지 안내에서 볼 수 있습니다.
        </p>
      </Card>

      {query.data && !isNightNow && !night ? (
        <Callout tone="warn" title="지금은 야간 시간대가 아닙니다">
          <p className="text-sm">
            야간 시간대({query.data.night.start}–{query.data.night.end})가 아니면 움직임 알림은
            만들어지지 않고 기록만 남습니다. 위의 "가장 최근의 야간 시간으로 보내기"를 켜거나 감지
            설정에서 야간 시간대를 바꿔 주세요.
          </p>
        </Callout>
      ) : null}

      {query.data ? <LastSendCard recent={query.data.recent} /> : null}

      <Callout tone="info" title="알아 두세요">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            사람이 움직인 것과 조명 변화, 카메라 자동 밝기 조절, 흔들림을 구분하지 못합니다. 화면이
            달라지면 모두 움직임으로 봅니다.
          </li>
          <li>
            뒤척임처럼 짧고 작은 움직임은 움직임으로 세지 않도록 큰 변화가 일정 시간 이어질 때만
            확정합니다. 다만 뒤척임과 일어나는 움직임을 카메라 화면 변화만으로는 정확히 구별할 수
            없어서, 구역을 나눠 "침대 칸에서만 움직이는지, 다른 칸으로 이어지는지"로 구분합니다.
          </li>
          <li>
            한 구역에서 한 번 보낸 뒤 5초 동안은 다시 보내지 않습니다. 침대 주변 움직임만으로는
            알림이 되지 않는 것이 기본입니다.
          </li>
          <li>
            시연용 입력입니다. 신호는 시뮬레이션 센서로 기록되며 실제 센서나 실제 상황이 아닙니다.
          </li>
        </ul>
      </Callout>
    </>
  )
}

/**
 * 노트북 카메라로 움직임을 찾아 시뮬레이션 센서 신호로 보내는 시연용 화면.
 * 개발·시연 서버(SIMULATOR_ENABLED)에서만 열린다. 신호는 시뮬레이터와 같은 수집 API 경로를 거친다.
 */
export function WebcamPage() {
  const features = useFeatures()
  const enabled = features.data?.simulatorEnabled === true

  return (
    <div className="space-y-4">
      <h1 className="text-h1">웹캠 움직임 감지</h1>
      <p className="text-body-sm text-ink-muted">
        개발자·시연 전용 화면입니다. 서버의 SIMULATOR_ENABLED 가 켜진 환경에서만 열립니다.
      </p>

      {features.isError ? (
        <ErrorState
          title="설정을 확인하지 못했습니다"
          error={features.error}
          onRetry={() => void features.refetch()}
        />
      ) : !features.data ? (
        <LoadingState />
      ) : !enabled ? (
        <Callout tone="info" title="시연 기능이 꺼져 있습니다">
          <p className="text-sm">
            서버의 SIMULATOR_ENABLED 설정이 꺼져 있어 이 화면을 쓸 수 없습니다. (운영 서버의
            기본값입니다)
          </p>
        </Callout>
      ) : (
        <>
          <WebcamPanel />
        </>
      )}
    </div>
  )
}
