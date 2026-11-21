import {
  BellRing,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { PATHS } from '@/app/paths'
import { DataOriginBadge, SeverityBadge } from '@/components/status/DomainBadges'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  OVERALL_LEVEL_HINTS,
  OVERALL_LEVEL_LABELS,
  type OverallLevel,
  type OverallStatusModel,
} from './deriveOverallStatus'

interface LevelStyle {
  icon: LucideIcon
  className: string
}

const LEVELS: Record<OverallLevel, LevelStyle> = {
  monitoring: {
    icon: CircleCheck,
    className: 'bg-status-ok-soft text-status-ok-strong',
  },
  incomplete: {
    icon: TriangleAlert,
    className: 'bg-status-warn-soft text-status-warn-strong',
  },
  attention: {
    icon: TriangleAlert,
    className: 'bg-status-warn-soft text-status-warn-strong',
  },
  urgent: {
    icon: BellRing,
    className: 'border-2 border-status-danger bg-status-danger-soft text-status-danger-strong',
  },
  disconnected: {
    icon: WifiOff,
    className: 'border-2 border-status-danger bg-status-danger-soft text-status-danger-strong',
  },
  unknown: {
    icon: CircleHelp,
    className: 'bg-status-muted-soft text-status-muted-strong',
  },
}

interface OverallStatusProps {
  model: OverallStatusModel
  /** 이 상태를 만든 데이터를 받은 시각. "마지막 업데이트"로 보여 준다. */
  updatedAt?: string | null
  /** 진행 중인 알림 수. 있으면 알림 센터로 가는 링크를 보여 준다. */
  alertCount?: number
}

/**
 * 대시보드 맨 위의 큰 상태 카드. 색 + 아이콘 + 글자로 전달한다.
 * 이 표시는 센서 신호를 받는지에 대한 것이며, 어르신의 안전을 보장한다는 뜻이 아니다.
 */
export function OverallStatus({ model, updatedAt = null, alertCount = 0 }: OverallStatusProps) {
  const { icon: Icon, className } = LEVELS[model.level]
  const label = OVERALL_LEVEL_LABELS[model.level]
  return (
    <section
      aria-label="현재 상태"
      role={model.level === 'urgent' || model.level === 'disconnected' ? 'alert' : 'status'}
      className={cn('relative overflow-hidden rounded-card p-6 md:p-8', className)}
    >
      {/* 두드리는 소리의 물결: 장식이다. 글자·상태 전달에는 쓰이지 않는다. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -top-16 -right-16 size-64 opacity-[0.12]"
      >
        {[28, 56, 84].map((r) => (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
          />
        ))}
      </svg>
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* 상태 아이콘은 흰 원 위에 크게: 멀리서도 모양으로 구분된다 (색 + 모양 + 글자) */}
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface">
          <Icon aria-hidden="true" className="size-8" />
        </span>
        <p className="text-h1 md:text-display">{label}</p>
        {model.level === 'urgent' ? <SeverityBadge severity="URGENT" /> : null}
      </div>
      {model.simulated ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DataOriginBadge origin="SIMULATED" />
          <span className="text-body-sm text-ink">
            시뮬레이션으로 만들어진 알림입니다. 실제 상황이 아닙니다.
          </span>
        </div>
      ) : null}
      <p className="relative mt-5 text-h2 text-ink">{model.headline}</p>
      <p className="relative mt-1 text-body text-ink">{OVERALL_LEVEL_HINTS[model.level]}</p>
      {model.reasons.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-body text-ink">
          {model.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-body-sm text-ink">
        <p>
          마지막 업데이트:{' '}
          {updatedAt ? (
            <time dateTime={updatedAt}>
              {formatRelative(updatedAt)} ({formatDateTime(updatedAt)})
            </time>
          ) : (
            '확인하지 못했습니다'
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-4">
          {model.alertId && alertCount > 0 ? (
            <Link
              to={PATHS.notificationDetail(model.alertId)}
              className="inline-flex min-h-11 items-center font-semibold underline"
            >
              알림 자세히 보기
            </Link>
          ) : null}
          {alertCount > 0 ? (
            <Link
              to={PATHS.notifications}
              className="inline-flex min-h-11 items-center font-semibold underline"
            >
              진행 중인 알림 {alertCount}건 보기
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}
