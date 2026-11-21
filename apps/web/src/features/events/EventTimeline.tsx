import { useMemo } from 'react'
import type { TimelineEvent } from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { formatLocalDayHeading } from '@/lib/localTime'
import { EventCard } from './EventCard'
import { groupByLocalDate } from './grouping'

interface EventTimelineProps {
  events: readonly TimelineEvent[]
  today: string
  selectedId: string | null
  onOpen: (id: string) => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** 다음 쪽을 읽다 실패했으면 그 오류. 이미 읽은 기록은 그대로 둔다. */
  nextPageError: Error | null
  onLoadMore: () => void
}

/**
 * 이벤트 타임라인. 선택한 정렬 순서대로, 날짜별로 묶어 보여 준다.
 * 다음 쪽은 "더 보기"로 이어 읽으며, 읽다 실패해도 이미 본 기록은 지워지지 않는다.
 */
export function EventTimeline({
  events,
  today,
  selectedId,
  onOpen,
  hasNextPage,
  isFetchingNextPage,
  nextPageError,
  onLoadMore,
}: EventTimelineProps) {
  const groups = useMemo(() => groupByLocalDate(events), [events])
  return (
    <section aria-label="이벤트 타임라인" className="space-y-6">
      {groups.map((group) => (
        <div key={group.date} className="space-y-3">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-h3">
            {formatLocalDayHeading(group.date)}
            {group.date === today ? (
              <span className="text-body-sm font-semibold text-brand-strong">오늘</span>
            ) : null}
            <span className="text-body-sm font-normal text-ink-muted">{group.events.length}건</span>
          </h2>
          {/* 세로선 위에 아이콘이 놓이는 타임라인 */}
          <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-5 before:top-3 before:w-px before:bg-line md:before:left-[1.375rem]">
            {group.events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                selected={event.id === selectedId}
                onOpen={onOpen}
              />
            ))}
          </ol>
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-body-sm text-ink-muted">
          {events.length}건 표시 중
          {hasNextPage ? ' · 아직 불러오지 않은 기록이 더 있습니다' : ' · 마지막 기록입니다'}
        </p>
        {nextPageError ? (
          <p role="alert" className="text-body text-status-danger-strong">
            다음 기록을 불러오지 못했습니다. {nextPageError.message}
          </p>
        ) : null}
        {hasNextPage ? (
          <Button
            variant="secondary"
            loading={isFetchingNextPage}
            loadingText="불러오는 중…"
            onClick={onLoadMore}
          >
            {nextPageError ? '다시 시도' : '더 보기'}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
