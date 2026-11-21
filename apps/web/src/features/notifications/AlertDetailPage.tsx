import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { CHANNEL_LABELS, ZONE_LABELS, classifyDelivery, type AlertDetail } from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { DataOriginBadge, SeverityBadge } from '@/components/status/DomainBadges'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { AlertClips } from './AlertClips'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { ApiError } from '@/services/apiClient'
import { formatDateTime } from '@/lib/format'
import {
  ALERT_TYPE_LABELS,
  DELIVERY_DISPLAY_HINTS,
  DELIVERY_STATUS_LABELS,
  PROVIDER_MODE_LABELS,
} from '@/lib/labels'
import type { DeliveryStatus } from '@tetris/shared'
import { Circle, CircleCheck, History } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { statusText } from './alertText'
import { DeliveryStateBadge } from './DeliveryStateBadge'
import { useAcknowledgeAlert, useAlertDetail, useMarkAlertRead, useResolveAlert } from './hooks'
import { relatedEventHref } from './relatedEvent'

const DELIVERY_TONE: Record<DeliveryStatus, StatusTone> = {
  SENT: 'ok',
  PENDING: 'checking',
  FAILED: 'danger',
  NOT_CONFIGURED: 'muted',
  CANCELLED: 'muted',
}

function actionError(error: Error | null): string | null {
  if (!error) return null
  if (error instanceof ApiError && error.status === 409) return error.message
  return error.message
}

function Actions({ detail }: { detail: AlertDetail }) {
  const { alert } = detail
  const acknowledge = useAcknowledgeAlert(alert.id)
  const resolve = useResolveAlert(alert.id)
  const [resolution, setResolution] = useState<'CHECKED' | 'FALSE_ALARM'>('CHECKED')
  const [note, setNote] = useState('')

  if (alert.status === 'RESOLVED') return null

  const onResolve = (event: FormEvent) => {
    event.preventDefault()
    resolve.mutate({ resolution, ...(note.trim() ? { note } : {}) })
  }

  return (
    <Card title="처리">
      <div className="space-y-4">
        {alert.status === 'OPEN' ? (
          <div>
            <Button onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>
              {acknowledge.isPending ? '처리 중…' : '확인했습니다'}
            </Button>
            <p className="mt-1 text-sm text-ink-muted">
              확인하면 재알림과 남은 전달 시도가 멈춥니다. 알림은 종료할 때까지 목록에 남습니다.
            </p>
            {actionError(acknowledge.error) ? (
              <p role="alert" className="mt-1 text-sm text-status-danger">
                {actionError(acknowledge.error)}
              </p>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={onResolve} className="space-y-3">
          <fieldset>
            <legend className="font-semibold">알림 종료</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              {(
                [
                  ['CHECKED', '확인함'],
                  ['FALSE_ALARM', '잘못된 알림'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-12 flex-1 items-center gap-2 rounded-control border border-line px-3"
                >
                  <input
                    type="radio"
                    name="resolution"
                    value={value}
                    checked={resolution === value}
                    onChange={() => setResolution(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="note" className="block font-semibold">
              메모 (선택)
            </label>
            <textarea
              id="note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 block min-h-24 w-full rounded-control border border-line bg-surface p-3"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={resolve.isPending}>
            {resolve.isPending ? '종료하는 중…' : '알림 종료'}
          </Button>
          {actionError(resolve.error) ? (
            <p role="alert" className="text-sm text-status-danger">
              {actionError(resolve.error)}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  )
}

/**
 * 읽음 표시. 읽음은 "봤다"는 기록일 뿐이라 확인·종료(처리)와 따로 두고, 읽어도 해결된 것이 아님을 알린다.
 */
function ReadControl({ alert }: { alert: AlertDetail['alert'] }) {
  const markRead = useMarkAlertRead()
  return (
    <Card title="읽음 표시">
      <div className="space-y-3">
        <p className="text-body">
          {alert.read ? '이 알림을 읽음으로 표시했습니다.' : '아직 읽음으로 표시하지 않았습니다.'}
        </p>
        {alert.status !== 'RESOLVED' ? (
          <Callout tone="warn" title="읽어도 해결된 것은 아닙니다">
            <p className="text-body-sm">
              읽음 표시는 알림을 봤다는 기록일 뿐입니다. 이 알림은 아직 {statusText(alert)}{' '}
              상태이며, 아래 "처리"에서 확인하거나 종료해야 합니다.
            </p>
          </Callout>
        ) : null}
        {!alert.read ? (
          <Button
            variant="secondary"
            loading={markRead.isPending}
            loadingText="표시하는 중…"
            onClick={() => markRead.mutate(alert.id)}
          >
            읽음으로 표시
          </Button>
        ) : null}
        {markRead.isError ? (
          <p role="alert" className="text-body-sm text-status-danger-strong">
            읽음으로 표시하지 못해 이전 상태로 되돌렸습니다. {markRead.error.message}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

function Body({ detail }: { detail: AlertDetail }) {
  const { alert, evidence, deliveries } = detail
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {alert.read ? (
            <Badge variant="neutral" size="sm">
              <CircleCheck aria-hidden="true" className="size-3.5" />
              읽음
            </Badge>
          ) : (
            <Badge variant="brand" size="sm">
              <Circle aria-hidden="true" className="size-3 fill-current" />
              읽지 않음
            </Badge>
          )}
          <SeverityBadge severity={alert.severity} />
          <span className="font-semibold text-ink-muted">{statusText(alert)}</span>
          {alert.origin === 'SIMULATED' ? <DataOriginBadge origin="SIMULATED" /> : null}
          {alert.deliveryState ? <DeliveryStateBadge state={alert.deliveryState} /> : null}
        </div>
        <h2 className="mt-2 text-xl font-bold">{alert.title}</h2>
        <p className="mt-1">{alert.message}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">종류</dt>
          <dd>{ALERT_TYPE_LABELS[alert.type]}</dd>
          <dt className="text-ink-muted">센서</dt>
          <dd>{alert.sensorName ?? '—'}</dd>
          <dt className="text-ink-muted">발생</dt>
          <dd>{formatDateTime(alert.triggeredAt)}</dd>
          <dt className="text-ink-muted">마지막 신호</dt>
          <dd>
            {formatDateTime(alert.lastEventAt)}
            {alert.occurrences > 1 ? ` (비슷한 신호 ${alert.occurrences}번)` : ''}
          </dd>
          {alert.acknowledgedAt ? (
            <>
              <dt className="text-ink-muted">확인</dt>
              <dd>
                {formatDateTime(alert.acknowledgedAt)}
                {alert.acknowledgedByName ? ` · ${alert.acknowledgedByName}` : ''}
              </dd>
            </>
          ) : null}
          {alert.resolvedAt ? (
            <>
              <dt className="text-ink-muted">종료</dt>
              <dd>{formatDateTime(alert.resolvedAt)}</dd>
            </>
          ) : null}
          {alert.reminderCount > 0 ? (
            <>
              <dt className="text-ink-muted">재알림</dt>
              <dd>{alert.reminderCount}번</dd>
            </>
          ) : null}
          {alert.note ? (
            <>
              <dt className="text-ink-muted">메모</dt>
              <dd>{alert.note}</dd>
            </>
          ) : null}
        </dl>
        {relatedEventHref(alert) ? (
          <Link
            to={relatedEventHref(alert) ?? ''}
            className={`mt-3 gap-1.5 ${buttonStyles({ variant: 'secondary' })}`}
          >
            <History aria-hidden="true" className="size-5" />
            관련 움직임 기록 보기
          </Link>
        ) : null}
      </Card>

      <ReadControl alert={alert} />

      <Actions detail={detail} />

      <Card title="근거가 된 신호">
        {evidence.length === 0 ? (
          <p className="text-ink-muted">
            연결된 움직임 신호가 없습니다. (센서 상태나 전달 문제로 만들어진 알림)
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {evidence.map((item) => (
              <li key={item.eventId} className="flex flex-wrap items-center gap-x-3 py-2">
                <span className="font-semibold">{formatDateTime(item.occurredAt)}</span>
                <span>
                  {ZONE_LABELS[item.zone]} · {item.sensorName}
                </span>
                {item.isLate ? <StatusBadge tone="muted">지연 수신</StatusBadge> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <AlertClips alertId={alert.id} />

      <Card title="알림 전달 결과">
        {deliveries.length === 0 ? (
          <p className="text-ink-muted">전달 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {CHANNEL_LABELS[delivery.channel]} · {delivery.guardianName}
                  </span>
                  {classifyDelivery(delivery) ? (
                    <DeliveryStateBadge state={classifyDelivery(delivery)!} />
                  ) : (
                    <StatusBadge tone={DELIVERY_TONE[delivery.status]}>
                      {DELIVERY_STATUS_LABELS[delivery.status]}
                    </StatusBadge>
                  )}
                </div>
                {classifyDelivery(delivery) ? (
                  <p className="text-body-sm text-ink">
                    {DELIVERY_DISPLAY_HINTS[classifyDelivery(delivery)!]}
                  </p>
                ) : null}
                <p className="text-sm text-ink-muted">
                  {delivery.providerMode
                    ? PROVIDER_MODE_LABELS[delivery.providerMode]
                    : '연동 없음'}
                  {delivery.attempts > 0 ? ` · 시도 ${delivery.attempts}번` : ''}
                  {delivery.sentAt ? ` · ${formatDateTime(delivery.sentAt)}` : ''}
                </p>
                {delivery.lastError ? (
                  <p className="text-sm text-status-danger">{delivery.lastError}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Callout tone="info" title="앱 화면 알림의 한계">
            <p className="text-sm">
              앱 화면 알림은 이 화면이 열려 있을 때만 전달됩니다. 브라우저 푸시는 서버에 설정되어
              있고 기기를 등록한 경우에만 보내며, 문자·카카오는 이 버전에서 연동하지 않았습니다.
            </p>
          </Callout>
        </div>
      </Card>
    </div>
  )
}

export function AlertDetailPage() {
  const { alertId = '' } = useParams()
  const query = useAlertDetail(alertId)

  return (
    <div className="space-y-4">
      <h1 className="text-h1">알림 상세</h1>
      {query.isError ? (
        <ErrorState
          title="알림을 불러오지 못했습니다"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <Body detail={query.data} />
      ) : (
        <LoadingState label="알림을 불러오는 중" />
      )}
    </div>
  )
}
