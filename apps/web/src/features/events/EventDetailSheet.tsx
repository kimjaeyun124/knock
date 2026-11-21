import { Link } from 'react-router'
import { ZONE_LABELS, type Sensor, type TimelineAlertRef, type TimelineEvent } from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { DataOriginBadge } from '@/components/status/DomainBadges'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Sheet } from '@/components/ui/Sheet'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { SensorStatusBadges } from '@/features/sensors/SensorStatusBadges'
import { formatRelative } from '@/lib/format'
import { formatLocalDateTime, formatLocalTime, localTimeZone } from '@/lib/localTime'
import {
  ALERT_STATUS_LABELS,
  ALERT_TYPE_LABELS,
  SEVERITY_LABELS,
  TIMELINE_ATTENTION_LABELS,
  TIMELINE_TYPE_LABELS,
} from '@/lib/labels'
import { ApiError } from '@/services/apiClient'
import { ATTENTION_TONES, ESTIMATED_TYPES } from './eventDisplay'
import { useTimelineEvent } from './hooks'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-line pt-4">
      <h3 className="text-h3">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-0.5 py-1">
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  )
}

const SEVERITY_TONE = { INFO: 'muted', NOTICE: 'warn', URGENT: 'danger' } as const

function AlertRow({ alert }: { alert: TimelineAlertRef }) {
  return (
    <li className="space-y-1 rounded-control border border-line p-3">
      <p className="text-body font-semibold">{ALERT_TYPE_LABELS[alert.type]}</p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={SEVERITY_TONE[alert.severity]} size="sm">
          {SEVERITY_LABELS[alert.severity]}
        </StatusBadge>
        <StatusBadge tone={alert.status === 'OPEN' ? 'warn' : 'muted'} size="sm">
          {ALERT_STATUS_LABELS[alert.status]}
        </StatusBadge>
      </div>
      <Link
        to={PATHS.notificationDetail(alert.id)}
        className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline"
      >
        알림 자세히 보기
      </Link>
    </li>
  )
}

interface EventDetailSheetProps {
  /** 열어 둔 이벤트 ID. 없으면 닫혀 있다. */
  id: string | null
  /** 이미 불러온 목록에서 찾은 이벤트. 상세를 기다리는 동안 먼저 보여 준다. */
  listed: TimelineEvent | undefined
  sensors: readonly Sensor[] | undefined
  onClose: () => void
}

/**
 * 이벤트 상세: 발생·수신 시각, 센서 정보, 판단에 사용된 규칙, 알림 처리 여부, 관련 센서 상태.
 * 주소(?event=)로 열리므로 새로고침하거나 링크를 열어도 같은 상세가 열린다.
 */
export function EventDetailSheet({ id, listed, sensors, onClose }: EventDetailSheetProps) {
  const detail = useTimelineEvent(id)
  const event = detail.data?.event ?? listed
  const sensor = event ? sensors?.find((item) => item.id === event.sensorId) : undefined
  const notFound =
    detail.error instanceof ApiError && detail.error.status === 404 && listed === undefined

  return (
    <Sheet
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={event ? TIMELINE_TYPE_LABELS[event.eventType] : '이벤트 상세'}
      description={event ? undefined : '기록을 불러오는 중입니다.'}
    >
      {notFound ? (
        <Callout tone="warn" title="기록을 찾을 수 없습니다">
          <p className="text-body-sm">
            삭제되었거나 보관 기간이 지난 기록일 수 있습니다. 목록으로 돌아가 다시 선택해 주세요.
          </p>
        </Callout>
      ) : detail.isError && !event ? (
        <div role="alert" className="space-y-3">
          <p className="text-body text-status-danger-strong">기록을 불러오지 못했습니다.</p>
          <p className="text-body-sm">{detail.error.message}</p>
          <Button variant="secondary" onClick={() => void detail.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : !event ? (
        <div role="status" className="space-y-3">
          <Skeleton className="h-6" />
          <Skeleton shape="block" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={ATTENTION_TONES[event.attention]}>
                주의 수준: {TIMELINE_ATTENTION_LABELS[event.attention]}
              </StatusBadge>
              {event.origin === 'SIMULATED' ? <DataOriginBadge origin="SIMULATED" /> : null}
            </div>
            <p className="text-body">{event.description}</p>
          </div>

          {ESTIMATED_TYPES.includes(event.eventType) ? (
            <Callout tone="info" title="센서 위치와 규칙에 따른 추정입니다">
              <p className="text-body-sm">
                움직임 센서 하나의 신호만으로 실제 상황을 확정할 수 없습니다. 걱정되시면 직접 확인해
                주세요.
              </p>
            </Callout>
          ) : null}

          <Section title="시각">
            <dl>
              <Row label="발생 시각">
                <time dateTime={event.occurredAt}>{formatLocalDateTime(event.occurredAt)}</time>
                <span className="block text-body-sm text-ink-muted">
                  {formatRelative(event.occurredAt)}
                </span>
              </Row>
              <Row label="수신 시각">
                <time dateTime={event.receivedAt}>{formatLocalDateTime(event.receivedAt)}</time>
                {event.isLate ? (
                  <span className="block text-body-sm text-ink-muted">
                    발생보다 늦게 도착한 신호입니다. (발생 {formatLocalTime(event.occurredAt)})
                  </span>
                ) : null}
              </Row>
              <Row label="시간대">{localTimeZone()} (이 기기 기준)</Row>
            </dl>
          </Section>

          <Section title="센서 정보">
            <dl>
              <Row label="센서">
                <Link
                  to={PATHS.sensorDetail(event.sensorId)}
                  className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline"
                >
                  {event.sensorName}
                </Link>
              </Row>
              <Row label="구역">{ZONE_LABELS[event.zone]}</Row>
            </dl>
            {sensor ? (
              <div className="space-y-1">
                <p className="text-body-sm text-ink-muted">
                  관련 센서의 현재 상태입니다. 이 기록이 만들어진 때의 상태가 아닙니다.
                </p>
                <SensorStatusBadges sensor={sensor} />
              </div>
            ) : sensors ? (
              <p className="text-body-sm text-ink-muted">
                이 센서는 지금 목록에 없습니다. (삭제되었을 수 있습니다)
              </p>
            ) : null}
          </Section>

          <Section title="판단에 사용된 규칙">
            <p className="text-body">{event.rule.text}</p>
            <p className="text-body-sm text-ink-muted">
              현재 감지 설정 기준의 설명입니다. 설정을 바꾸면 이 설명도 바뀔 수 있습니다.
            </p>
          </Section>

          <Section title="알림 처리">
            {event.alerts.length === 0 ? (
              <p className="text-body">이 기록으로 만들어진 알림은 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {event.alerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </ul>
            )}
          </Section>

          {detail.data && detail.data.relatedEvents.length > 0 ? (
            <Section title="함께 근거가 된 신호">
              <ul className="divide-y divide-line">
                {detail.data.relatedEvents.map((related) => (
                  <li key={related.id} className="py-2 text-body">
                    <time dateTime={related.occurredAt} className="font-semibold">
                      {formatLocalDateTime(related.occurredAt)}
                    </time>
                    <span className="text-ink-muted">
                      {' '}
                      · {ZONE_LABELS[related.zone]} · {related.sensorName}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Link
            to={PATHS.sensorDetail(event.sensorId)}
            className={buttonStyles({ variant: 'secondary' })}
          >
            센서 상세 보기
          </Link>
        </div>
      )}
    </Sheet>
  )
}
