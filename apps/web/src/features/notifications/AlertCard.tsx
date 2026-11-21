import { Circle, CircleCheck, History } from 'lucide-react'
import { Link } from 'react-router'
import type { AlertItem } from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { DataOriginBadge, SeverityBadge } from '@/components/status/DomainBadges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { cn } from '@/lib/cn'
import { formatDateTime, formatRelative } from '@/lib/format'
import { ALERT_TYPE_LABELS } from '@/lib/labels'
import { deliverySummaryText, statusText } from './alertText'
import { DeliveryStateBadge } from './DeliveryStateBadge'
import { useMarkAlertRead } from './hooks'
import { relatedEventHref } from './relatedEvent'

/**
 * 알림 한 장. 읽음 여부(읽지 않음/읽음)와 처리 상태(진행 중/확인함/종료)는 서로 다른 값이라 따로 보여 준다.
 * 읽었다고 해서 해결된 것이 아니므로, 읽었지만 아직 처리하지 않은 알림에는 그렇게 적는다.
 */
export function AlertCard({ alert }: { alert: AlertItem }) {
  const markRead = useMarkAlertRead()
  const eventHref = relatedEventHref(alert)
  const unresolvedButRead = alert.read && alert.status === 'OPEN'

  return (
    <li
      className={cn(
        'space-y-2 rounded-card border bg-surface p-4',
        alert.read ? 'border-line' : 'border-brand border-l-4',
      )}
    >
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
        <span className="text-body-sm font-semibold text-ink-muted">{statusText(alert)}</span>
        {alert.origin === 'SIMULATED' ? <DataOriginBadge origin="SIMULATED" /> : null}
      </div>

      <h2 className="text-h3">
        <Link
          to={PATHS.notificationDetail(alert.id)}
          className={cn(
            'block min-h-11 py-1 text-brand-strong underline-offset-2 hover:underline',
            alert.read ? 'font-semibold' : 'font-bold',
          )}
        >
          {alert.title}
        </Link>
      </h2>
      <p className="line-clamp-2 text-body text-ink md:line-clamp-none">{alert.message}</p>
      <p className="text-body-sm text-ink-muted">
        {ALERT_TYPE_LABELS[alert.type]} ·{' '}
        <time dateTime={alert.triggeredAt}>{formatRelative(alert.triggeredAt)}</time> (
        {formatDateTime(alert.triggeredAt)}){alert.sensorName ? ` · ${alert.sensorName}` : ''}
        {alert.occurrences > 1 ? ` · 비슷한 신호 ${alert.occurrences}번` : ''}
      </p>

      {unresolvedButRead ? (
        <p className="text-body-sm font-semibold text-status-warn-strong">
          읽었지만 아직 확인 처리하지 않은 알림입니다. 읽음 표시는 상황이 해결되었다는 뜻이
          아닙니다.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {alert.deliveryState ? (
          <DeliveryStateBadge state={alert.deliveryState} />
        ) : (
          <span className="text-body-sm text-ink-muted">{deliverySummaryText(alert)}</span>
        )}
        {alert.delivery.failed > 0 && alert.deliveryState !== 'FAILED' ? (
          <span className="text-body-sm font-semibold text-status-danger-strong">
            일부 채널 전송 실패 {alert.delivery.failed}건
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!alert.read ? (
          <Button
            size="sm"
            variant="secondary"
            loading={markRead.isPending}
            loadingText="표시하는 중…"
            aria-label={`${alert.title} 읽음으로 표시`}
            onClick={() => markRead.mutate(alert.id)}
          >
            읽음으로 표시
          </Button>
        ) : null}
        {eventHref ? (
          <Link
            to={eventHref}
            aria-label={`${alert.title} 관련 움직임 기록 보기`}
            className={cn(buttonStyles({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
          >
            <History aria-hidden="true" className="size-4" />
            관련 움직임 기록 보기
          </Link>
        ) : null}
      </div>
      {markRead.isError ? (
        <p role="alert" className="text-body-sm text-status-danger-strong">
          읽음으로 표시하지 못해 이전 상태로 되돌렸습니다. {markRead.error.message}
        </p>
      ) : null}
    </li>
  )
}
