import { PAGE_TITLES } from '@/app/paths'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatClock, formatLongDate, formatRelative } from '@/lib/format'
import { MONITORING_LABELS, type MonitoringState } from './monitoring'

const MONITORING_TONE: Record<MonitoringState, StatusTone> = {
  active: 'ok',
  partial: 'warn',
  stopped: 'danger',
  inactive: 'muted',
}

interface GreetingHeaderProps {
  now: Date
  /** 모니터링 상태. 데이터를 받기 전이면 null */
  monitoring: MonitoringState | null
  /** 마지막으로 센서 신호를 받은 시각. 한 번도 없으면 null, 데이터를 받기 전이면 undefined */
  lastDataAt: string | null | undefined
  /** 연결이 끊겨 받아 둔 정보일 때 — 모니터링·수신 시각이 "지금" 값이 아니라고 알린다 */
  stale?: boolean
}

/** 화면 맨 위: 인사, 오늘 날짜·시간, 모니터링 켜짐 여부, 마지막 데이터 수신 시각 */
export function GreetingHeader({
  now,
  monitoring,
  lastDataAt,
  stale = false,
}: GreetingHeaderProps) {
  return (
    <PageHeader
      title={PAGE_TITLES.dashboard}
      description="안녕하세요. 오늘의 안전 상태를 확인하세요."
      meta={
        <>
          <time dateTime={now.toISOString()} className="text-body text-ink">
            {formatLongDate(now)} · {formatClock(now)}
          </time>
          {monitoring ? (
            <StatusBadge tone={stale ? 'muted' : MONITORING_TONE[monitoring]}>
              {MONITORING_LABELS[monitoring]}
              {stale ? ' (마지막 확인 기준)' : ''}
            </StatusBadge>
          ) : null}
          {lastDataAt !== undefined ? (
            <span className="text-body-sm text-ink-muted">
              마지막 데이터 수신:{' '}
              {lastDataAt ? (
                <time dateTime={lastDataAt}>{formatRelative(lastDataAt, now)}</time>
              ) : (
                '아직 없음'
              )}
            </span>
          ) : null}
        </>
      }
    />
  )
}
