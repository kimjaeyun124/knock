import { SearchX, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import { PAGE_TITLES, PATHS } from '@/app/paths'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useSensors } from '@/features/sensors/hooks'
import { useConnection } from '@/hooks/connectionContext'
import { localTimeZone } from '@/lib/localTime'
import { ApiError } from '@/services/apiClient'
import { EventDetailSheet } from './EventDetailSheet'
import { EventFilterPanel } from './EventFilterPanel'
import { EventSummary } from './EventSummary'
import { EventTimeline } from './EventTimeline'
import { PeriodPicker } from './PeriodPicker'
import { rangeError, toTimelineFilter, toTimelineQuery } from './filters'
import { useTimelinePages, useTimelineSummary } from './hooks'
import { useEventFilters } from './useEventFilters'

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      <div role="status">
        <StatusBadge tone="checking">기록을 불러오는 중</StatusBadge>
      </div>
      {[0, 1, 2].map((index) => (
        <Card key={index} padding="sm">
          <Skeleton className="mb-3 h-5 w-1/3" />
          <SkeletonText lines={2} />
        </Card>
      ))}
    </div>
  )
}

/**
 * 움직임 기록. 센서가 감지한 움직임과 센서 상태 변화(연결 끊김·복구·배터리 부족)를 시간순 타임라인으로 보여 준다.
 *
 * 화면 상태: 불러오는 중 · 기록 있음 · 비어 있음(기록 없음 / 조건에 맞는 것 없음) · 불러오기 실패 · 연결 끊김
 * 조건은 주소에 담겨 새로고침·링크 공유로도 같은 목록이 열린다. 시각은 서버가 ISO 8601(UTC)로 주고, 이 기기의 시간대로 보여 준다.
 */
export function EventsPage() {
  const {
    filters,
    today,
    isDefault,
    selectedId,
    setFilters,
    setPreset,
    reset,
    openEvent,
    closeEvent,
  } = useEventFilters()
  const connection = useConnection()
  const sensors = useSensors()

  const invalidRange = rangeError(filters)
  const enabled = invalidRange === null
  const pages = useTimelinePages(toTimelineQuery(filters), enabled)
  const summary = useTimelineSummary(toTimelineFilter(filters), enabled)

  const events = pages.data?.pages.flatMap((page) => page.events) ?? []
  const offline = connection.state === 'disconnected' || connection.state === 'unknown'
  const loadedFailure = pages.isError && !pages.isFetchNextPageError && events.length > 0

  let body
  if (invalidRange) {
    body = (
      <EmptyState
        icon={SearchX}
        title="조회 기간을 확인해 주세요"
        description={`${invalidRange} 올바른 기간을 고르면 기록이 표시됩니다.`}
      />
    )
  } else if (pages.data === undefined) {
    body = offline ? (
      <EmptyState
        icon={WifiOff}
        size="comfortable"
        title="연결이 끊겨 기록을 볼 수 없습니다"
        description={`${connection.detail} 연결이 돌아오면 자동으로 다시 불러옵니다.`}
      />
    ) : pages.isError ? (
      <ErrorState
        variant="panel"
        title="기록을 불러오지 못했습니다"
        message={pages.error.message}
        detail={
          pages.error instanceof ApiError && pages.error.requestId
            ? `문의할 때 알려 주세요: ${pages.error.requestId}`
            : null
        }
        onRetry={() => void pages.refetch()}
      />
    ) : (
      <TimelineSkeleton />
    )
  } else if (events.length === 0) {
    // "기록이 없다"와 "조건에 맞는 기록이 없다"는 다른 상황이라 안내와 다음 행동이 다르다.
    body = isDefault ? (
      <EmptyState
        title="이 기간에 기록된 움직임이 없습니다"
        description="센서가 움직임을 감지하거나 센서 상태가 바뀌면 여기에 시간순으로 쌓입니다."
        action={
          <Link to={PATHS.sensors} className={buttonStyles({ variant: 'secondary' })}>
            센서 확인하기
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="조건에 맞는 기록이 없습니다"
        description="기간을 넓히거나 조건을 줄여 보세요."
        action={<Button onClick={reset}>조건 초기화</Button>}
      />
    )
  } else {
    body = (
      <EventTimeline
        events={events}
        today={today}
        selectedId={selectedId}
        onOpen={openEvent}
        hasNextPage={pages.hasNextPage}
        isFetchingNextPage={pages.isFetchingNextPage}
        nextPageError={pages.isFetchNextPageError ? pages.error : null}
        onLoadMore={() => void pages.fetchNextPage()}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={PAGE_TITLES.events}
        description={`센서가 감지한 움직임과 센서 상태 변화를 시간순으로 확인합니다. 시각은 이 기기의 시간대(${localTimeZone()}) 기준입니다.`}
        actions={<PeriodPicker filters={filters} today={today} onPreset={setPreset} />}
      />

      <p className="text-body-sm text-ink-muted">
        침대 주변·현관 주변 움직임은 센서 위치와 규칙에 따른 추정입니다. 움직임 센서 하나의
        신호만으로 실제 상황을 확정하지 않습니다.
      </p>

      <EventFilterPanel
        filters={filters}
        today={today}
        onChange={setFilters}
        onReset={reset}
        isDefault={isDefault}
        rangeError={invalidRange}
        sensors={sensors.data?.sensors}
        sensorsFailed={sensors.isError}
      />

      {enabled ? <EventSummary summary={summary} /> : null}

      {loadedFailure || (offline && pages.data !== undefined) ? (
        <Callout tone="warn" title="최신 기록이 아닐 수 있습니다">
          <p className="text-body-sm">
            {loadedFailure
              ? `기록을 새로 불러오지 못했습니다. ${pages.error?.message ?? ''}`
              : '연결이 끊겨 있습니다.'}{' '}
            아래는 마지막으로 받은 기록입니다.
          </p>
          {loadedFailure ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void pages.refetch()}
            >
              다시 불러오기
            </Button>
          ) : null}
        </Callout>
      ) : null}

      {body}

      <EventDetailSheet
        id={selectedId}
        listed={events.find((event) => event.id === selectedId)}
        sensors={sensors.data?.sensors}
        onClose={closeEvent}
      />
    </div>
  )
}
