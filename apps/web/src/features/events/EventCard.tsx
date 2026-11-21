import { BellRing, ChevronRight } from 'lucide-react'
import { ZONE_LABELS, type TimelineEvent } from '@tetris/shared'
import { DataOriginBadge } from '@/components/status/DomainBadges'
import { Badge } from '@/components/ui/Badge'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TONE_STYLES } from '@/components/ui/tones'
import { cn } from '@/lib/cn'
import { formatLocalTime } from '@/lib/localTime'
import { TIMELINE_ATTENTION_LABELS, TIMELINE_TYPE_LABELS } from '@/lib/labels'
import { ATTENTION_TONES, EVENT_ICONS, eventTone } from './eventDisplay'

interface EventCardProps {
  event: TimelineEvent
  selected: boolean
  onOpen: (id: string) => void
}

/**
 * 이벤트 카드 한 장. 시각과 이벤트 종류를 맨 앞에 두고, 위치·설명·주의 수준·알림 여부를 이어 보여 준다.
 * 누르면 상세가 열린다. (관리자 표가 아니라 읽기 쉬운 카드)
 */
export function EventCard({ event, selected, onOpen }: EventCardProps) {
  const tone = TONE_STYLES[eventTone(event)]
  const Icon = EVENT_ICONS[event.eventType]
  return (
    <li className="relative pl-12 md:pl-14">
      {/* 타임라인의 아이콘. 선 위에 놓여 이벤트 종류를 모양으로 알려 준다. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-3 flex size-10 items-center justify-center rounded-full border-2 border-surface ring-1 ring-line md:size-11',
          tone.soft,
          tone.text,
        )}
      >
        <Icon className="size-5" />
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onOpen(event.id)}
        className={cn(
          'flex min-h-16 w-full items-start gap-3 rounded-card border bg-surface p-3 text-left hover:bg-canvas md:p-4',
          selected ? 'border-brand ring-2 ring-brand' : 'border-line',
        )}
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <time dateTime={event.occurredAt} className="text-h3 tabular-nums">
              {formatLocalTime(event.occurredAt)}
            </time>
            <span className="text-body font-semibold">{TIMELINE_TYPE_LABELS[event.eventType]}</span>
          </span>
          <span className="block text-body-sm text-ink-muted">
            {ZONE_LABELS[event.zone]} · {event.sensorName}
            <span className="hidden md:inline"> · 수신 {formatLocalTime(event.receivedAt)}</span>
          </span>
          <span className="line-clamp-2 block text-body-sm text-ink md:line-clamp-none">
            {event.description}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {event.attention !== 'NORMAL' ? (
              <StatusBadge tone={ATTENTION_TONES[event.attention]} size="sm">
                {TIMELINE_ATTENTION_LABELS[event.attention]}
              </StatusBadge>
            ) : null}
            {event.alertRaised ? (
              <Badge variant="brand" size="sm">
                <BellRing aria-hidden="true" className="size-3.5" />
                알림 발생
              </Badge>
            ) : null}
            {event.isLate ? (
              <StatusBadge tone="muted" size="sm">
                늦게 도착
              </StatusBadge>
            ) : null}
            {event.origin === 'SIMULATED' ? <DataOriginBadge origin="SIMULATED" /> : null}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-muted" />
      </button>
    </li>
  )
}
