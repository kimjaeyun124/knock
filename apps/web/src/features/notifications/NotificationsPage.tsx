import { BellOff, SearchX, WifiOff } from 'lucide-react'
import { ALERT_STATUSES, ALERT_TYPES, type AlertStatus, type AlertType } from '@tetris/shared'
import { PAGE_TITLES } from '@/app/paths'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SelectField } from '@/components/ui/fields'
import { useConnection } from '@/hooks/connectionContext'
import { cn } from '@/lib/cn'
import { ALERT_STATUS_LABELS, ALERT_TYPE_LABELS } from '@/lib/labels'
import { AlertCard } from './AlertCard'
import { ALERT_VIEWS, ALERT_VIEW_LABELS, toAlertListFilter, type AlertView } from './filters'
import { useAlertPages, useUnreadCount } from './hooks'
import { UnreadSummary } from './UnreadSummary'
import { useAlertFilters } from './useAlertFilters'

/**
 * 알림 센터. 중요 움직임과 센서 문제를 놓치지 않고 확인하는 곳이다.
 *
 *  - 읽지 않은 알림 수와 "모두 읽음"
 *  - 보기: 전체 / 읽지 않음 / 중요 (+ 알림 종류·처리 상태)
 *  - 알림마다 읽음 여부·처리 상태·전달 상태·관련 움직임 기록
 *
 * 읽음(봤다)과 처리 상태(확인·종료)는 다른 값이다. 읽어도 해결된 것이 아니다.
 * 실시간 신호가 오면 useRealtimeSync 가 목록과 읽지 않은 수를 ID 기준으로 갱신한다.
 */
export function NotificationsPage() {
  const { filters, isDefault, setFilters, reset } = useAlertFilters()
  const connection = useConnection()
  const unread = useUnreadCount()
  const query = useAlertPages(toAlertListFilter(filters))

  const alerts = query.data?.pages.flatMap((page) => page.alerts) ?? []
  const offline = connection.state === 'disconnected' || connection.state === 'unknown'
  const viewLabel = (view: AlertView) =>
    view === 'unread' && unread.data && unread.data.unread > 0
      ? `${ALERT_VIEW_LABELS[view]} ${unread.data.unread}`
      : ALERT_VIEW_LABELS[view]

  let body
  if (query.data === undefined) {
    body = offline ? (
      <EmptyState
        icon={WifiOff}
        size="comfortable"
        title="연결이 끊겨 알림을 볼 수 없습니다"
        description={`${connection.detail} 연결이 돌아오면 자동으로 다시 불러옵니다.`}
      />
    ) : query.isError ? (
      <ErrorState
        title="알림을 불러오지 못했습니다"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    ) : (
      <LoadingState label="알림을 불러오는 중" />
    )
  } else if (alerts.length === 0) {
    body =
      !isDefault && (filters.type || filters.status) ? (
        <EmptyState
          icon={SearchX}
          title="조건에 맞는 알림이 없습니다"
          description="알림 종류나 처리 상태 조건을 바꿔 보세요."
          action={<Button onClick={reset}>조건 초기화</Button>}
        />
      ) : (
        <EmptyState
          icon={BellOff}
          title={
            filters.view === 'unread'
              ? '읽지 않은 알림이 없습니다'
              : filters.view === 'important'
                ? '중요 알림이 없습니다'
                : '알림이 없습니다'
          }
          description={
            filters.view === 'unread'
              ? '읽은 알림 중에도 아직 확인·종료하지 않은 것이 있을 수 있습니다. "전체"에서 처리 상태를 확인하세요.'
              : '알림이 없다는 것이 모든 상황을 확인했다는 뜻은 아닙니다. 센서 연결 상태는 상단 띠에서 확인하세요.'
          }
        />
      )
  } else {
    body = (
      <>
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </ul>
        {query.isFetchNextPageError ? (
          <p role="alert" className="text-body text-status-danger-strong">
            다음 알림을 불러오지 못했습니다. {query.error?.message}
          </p>
        ) : null}
        {query.hasNextPage ? (
          <Button
            variant="secondary"
            className="w-full"
            loading={query.isFetchingNextPage}
            loadingText="불러오는 중…"
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchNextPageError ? '다시 시도' : '더 보기'}
          </Button>
        ) : (
          <p className="text-body-sm text-ink-muted">{alerts.length}건 · 마지막 알림입니다</p>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={PAGE_TITLES.notifications}
        description="중요한 움직임과 센서 문제를 놓치지 않고 확인합니다."
      />

      <UnreadSummary
        count={unread.data}
        failed={unread.isError}
        onRetry={() => void unread.refetch()}
      />

      <div role="tablist" aria-label="알림 보기" className="flex gap-2">
        {ALERT_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={filters.view === view}
            onClick={() => setFilters({ view })}
            className={cn(
              'min-h-12 flex-1 rounded-control border px-4 font-semibold',
              filters.view === view
                ? 'border-brand bg-brand-soft text-brand-strong'
                : 'border-line bg-surface text-ink',
            )}
          >
            {viewLabel(view)}
          </button>
        ))}
      </div>

      <Card padding="sm" className="md:p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="알림 종류"
            value={filters.type}
            onChange={(event) => setFilters({ type: event.target.value as AlertType | '' })}
          >
            <option value="">모든 종류</option>
            {ALERT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ALERT_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="처리 상태"
            hint="읽음 여부와는 별개로, 확인·종료했는지를 기준으로 거릅니다."
            value={filters.status}
            onChange={(event) => setFilters({ status: event.target.value as AlertStatus | '' })}
          >
            <option value="">모든 상태</option>
            {ALERT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ALERT_STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {body}
    </div>
  )
}
