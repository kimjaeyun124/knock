import type { ReactNode } from 'react'
import {
  SENSITIVITY_LABELS,
  ZONE_LABELS,
  type AlertPreferencesInput,
  type DetectionSettings,
  type HouseholdResponse,
  type Sensor,
} from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { formatTimeOfDay } from '@/lib/format'
import {
  useBrowserNotificationState,
  type BrowserNotificationState,
} from '@/features/settings/useBrowserNotificationState'
import { buildChecklist, hasBlocking, type ChecklistItem, type PushSummary } from './checklist'
import { crossesMidnight, describeDuration, durationMinutes } from './schedule'

function SummaryCard({
  title,
  step,
  onEdit,
  children,
}: {
  title: string
  step: number
  onEdit: (step: number) => void
  children: ReactNode
}) {
  return (
    <Card
      title={title}
      actions={
        <Button variant="ghost" aria-label={`${title} 수정`} onClick={() => onEdit(step)}>
          수정
        </Button>
      }
    >
      {children}
    </Card>
  )
}

const ALERT_ROWS: { key: keyof AlertPreferencesInput; label: string }[] = [
  { key: 'entranceApproach', label: '현관 근처 움직임' },
  { key: 'bedToPath', label: '침대 주변에서 이동 경로로 이어진 움직임' },
  { key: 'repeatedMovement', label: '짧은 시간 안의 반복된 움직임' },
  { key: 'bedAreaActivity', label: '침대 주변 움직임' },
  { key: 'sensorIssues', label: '센서 이상 (연결 끊김·복구)' },
  { key: 'lowBattery', label: '배터리 부족' },
]

function pushSummary(state: BrowserNotificationState): PushSummary {
  if (state.kind === 'registered') return 'registered'
  if (state.kind === 'ready' || state.kind === 'denied') return 'not-registered'
  return 'unavailable'
}

const PUSH_TEXT: Record<BrowserNotificationState['kind'], string> = {
  loading: '확인하는 중입니다.',
  error: '상태를 확인하지 못했습니다.',
  'server-off':
    '이 서버에는 푸시가 설정되어 있지 않습니다. 앱 화면이 열려 있을 때만 알림이 보입니다.',
  unsupported: '이 브라우저는 푸시를 지원하지 않습니다. 앱 화면이 열려 있을 때만 알림이 보입니다.',
  denied: '알림이 차단되어 있어 이 기기에서는 푸시를 받지 못합니다.',
  registered: '이 기기에서 푸시를 받도록 등록되어 있습니다.',
  ready: '이 기기는 아직 등록하지 않았습니다. 앱 화면이 열려 있을 때만 알림이 보입니다.',
}

const TONE_ORDER = { blocking: 0, warn: 1, info: 2 } as const

function ChecklistView({
  items,
  onEdit,
}: {
  items: ChecklistItem[]
  onEdit: (step: number) => void
}) {
  if (items.length === 0) {
    return (
      <Callout tone="ok" title="모든 항목을 설정했습니다">
        <p className="text-body-sm">
          설정을 마친 뒤에도 센서·감지 기준·알림은 설정 메뉴에서 바꿀 수 있습니다.
        </p>
      </Callout>
    )
  }
  const sorted = [...items].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
  const blocking = hasBlocking(items)
  return (
    <Callout
      tone={blocking || items.some((i) => i.tone === 'warn') ? 'warn' : 'info'}
      title={
        blocking ? '설정을 완료하려면 먼저 채워야 할 항목이 있습니다' : '아직 마치지 않은 항목'
      }
    >
      <ul className="mt-1 space-y-2">
        {sorted.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1 text-body-sm">
              {item.tone === 'blocking' ? <strong>필수 · </strong> : null}
              {item.tone === 'info' ? '선택 · ' : null}
              {item.text}
            </span>
            <Button variant="secondary" onClick={() => onEdit(item.step)}>
              {item.step}단계로 가기
            </Button>
          </li>
        ))}
      </ul>
      {blocking ? null : (
        <p className="mt-3 text-body-sm">
          이대로 설정을 완료해도 됩니다. 남은 항목은 나중에 센서·설정 메뉴에서 이어서 할 수
          있습니다.
        </p>
      )}
    </Callout>
  )
}

/** STEP 6. 저장된 설정을 요약하고, 마치지 않은 항목을 알린 뒤 완료한다. */
export function ReviewStep({
  household,
  detection,
  prefs,
  sensors,
  onEdit,
  onBack,
  onComplete,
  completing,
  error,
}: {
  household: HouseholdResponse['household']
  detection: DetectionSettings
  prefs: AlertPreferencesInput
  sensors: readonly Sensor[]
  onEdit: (step: number) => void
  onBack: () => void
  onComplete: () => void
  completing: boolean
  error: string | null
}) {
  const { state } = useBrowserNotificationState()
  const items = buildChecklist({
    alias: household.recipientAlias,
    sensors,
    prefs,
    push: pushSummary(state),
  })
  const blocking = hasBlocking(items)
  const connected = sensors.filter((s) => s.isActive && s.lastSeenAt !== null).length
  const simulated = sensors.filter((s) => s.origin === 'SIMULATED').length

  return (
    <div className="space-y-4">
      <p>저장된 설정입니다. 틀린 곳은 "수정"으로 돌아가 고칠 수 있습니다.</p>
      <ChecklistView items={items} onEdit={onEdit} />

      <SummaryCard title="보호 대상" step={2} onEdit={onEdit}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">표시 이름</dt>
          <dd className="font-semibold">{household.recipientAlias ?? '입력하지 않음'}</dd>
          <dt className="text-ink-muted">메모</dt>
          <dd className="whitespace-pre-wrap">{household.recipientMemo ?? '없음'}</dd>
        </dl>
      </SummaryCard>

      <SummaryCard title="센서" step={3} onEdit={onEdit}>
        {sensors.length === 0 ? (
          <p>등록한 센서가 없습니다.</p>
        ) : (
          <>
            <p className="font-semibold">
              {sensors.length}개 등록 · 첫 신호를 받은 센서 {connected}개
              {simulated > 0 ? ` · 시뮬레이션 ${simulated}개` : ''}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {sensors.map((sensor) => (
                <li key={sensor.id}>
                  {sensor.name} ({ZONE_LABELS[sensor.zone]},{' '}
                  {sensor.origin === 'REAL' ? '실제 센서' : '시뮬레이션'}) —{' '}
                  {sensor.lastSeenAt ? '신호를 받았습니다' : '아직 신호를 받지 못했습니다'}
                </li>
              ))}
            </ul>
          </>
        )}
      </SummaryCard>

      <SummaryCard title="모니터링 시간" step={4} onEdit={onEdit}>
        <p className="font-semibold">
          {formatTimeOfDay(detection.nightStart)} ~{' '}
          {crossesMidnight(detection.nightStart, detection.nightEnd) ? '다음 날 ' : ''}
          {formatTimeOfDay(detection.nightEnd)} (
          {describeDuration(durationMinutes(detection.nightStart, detection.nightEnd))})
        </p>
        <p className="text-body-sm text-ink-muted">
          민감도 {SENSITIVITY_LABELS[detection.sensitivity]} · 한국 시간 기준
        </p>
      </SummaryCard>

      <SummaryCard title="알림 설정" step={5} onEdit={onEdit}>
        <ul className="space-y-1">
          {ALERT_ROWS.map((row) => (
            <li key={row.key} className="flex justify-between gap-3">
              <span>{row.label}</span>
              <span className="shrink-0 font-semibold">
                {prefs[row.key] ? '받음' : '받지 않음'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-body-sm text-ink-muted">브라우저 알림: {PUSH_TEXT[state.kind]}</p>
      </SummaryCard>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onBack} disabled={completing}>
          이전
        </Button>
        <Button
          disabled={blocking}
          loading={completing}
          loadingText="저장하는 중…"
          onClick={onComplete}
        >
          설정 완료
        </Button>
      </div>
      {error ? (
        <p role="alert" className="font-semibold text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
