import { Moon, Sun } from 'lucide-react'
import { Link } from 'react-router'
import { ZONE_LABELS, type DashboardSummary } from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { DataOriginBadge } from '@/components/status/DomainBadges'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { formatDateTime, formatRelative } from '@/lib/format'
import { eventAttention } from './monitoring'

/** 최근 움직임: 최신 5건과 전체 기록으로 가는 버튼 */
export function RecentMovements({
  summary,
  stale = false,
}: {
  summary: DashboardSummary
  stale?: boolean
}) {
  const events = summary.recentEvents
  return (
    <Card
      title="최근 움직임"
      description={
        stale ? '연결이 끊기기 전에 받은 기록입니다.' : '센서가 감지한 움직임 신호 최근 5건'
      }
    >
      {events.length === 0 ? (
        <EmptyState
          title="최근 감지된 움직임이 없습니다"
          description="센서가 보낸 움직임 신호가 아직 없습니다."
        />
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event) => {
            const night = eventAttention(event, summary.schedule) === 'night'
            return (
              <li key={event.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body font-semibold">
                    <time dateTime={event.occurredAt}>{formatRelative(event.occurredAt)}</time>
                    <span className="ml-2 text-body-sm font-normal text-ink-muted">
                      {formatDateTime(event.occurredAt)}
                    </span>
                  </p>
                  <StatusBadge tone={night ? 'warn' : 'muted'} icon={night ? Moon : Sun} size="sm">
                    {night ? '야간 감지' : '주간 감지'}
                  </StatusBadge>
                </div>
                <p className="text-body">
                  {ZONE_LABELS[event.zone]} · 움직임 감지
                  <span className="text-ink-muted"> ({event.sensorName})</span>
                </p>
                {event.origin === 'SIMULATED' ? <DataOriginBadge origin="SIMULATED" /> : null}
              </li>
            )
          })}
        </ul>
      )}
      <Link to={PATHS.events} className={`mt-3 ${buttonStyles({ variant: 'secondary' })}`}>
        전체 기록 보기
      </Link>
    </Card>
  )
}
