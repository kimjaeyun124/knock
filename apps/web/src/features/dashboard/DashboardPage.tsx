import { Link } from 'react-router'
import type { DashboardSummary } from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { Callout } from '@/components/ui/Callout'
import { ErrorState } from '@/components/ui/ErrorState'
import { useHousehold } from '@/features/onboarding/hooks'
import { countSensors } from '@/features/sensors/sensorStatus'
import { useConnection } from '@/hooks/connectionContext'
import { useNow } from '@/hooks/useNow'
import { formatClock, kstDateString } from '@/lib/format'
import {
  DashboardEmpty,
  DashboardError,
  DashboardLoading,
  DashboardOffline,
} from './DashboardStates'
import { DeliveryLimitNotice } from './DeliveryLimitNotice'
import { deriveOverallStatus, unavailableStatus, unknownOverallStatus } from './deriveOverallStatus'
import { GreetingHeader } from './GreetingHeader'
import { useDashboard } from './hooks'
import { monitoringState } from './monitoring'
import { MonitoringCard } from './MonitoringCard'
import { OverallStatus } from './OverallStatus'
import { QuickActions } from './QuickActions'
import { RecentMovements } from './RecentMovements'
import { WeeklySummary } from './WeeklySummary'
import { ZoneSensors } from './ZoneSensors'

function SetupReminder() {
  const household = useHousehold()
  // 안내일 뿐이므로 확인하지 못해도 화면을 막지 않는다.
  if (!household.data || household.data.household.setupCompleted) return null
  return (
    <Callout tone="warn" title="초기 설정을 마치지 않았습니다">
      <p className="text-body-sm">
        보호 대상, 센서, 모니터링 시간, 알림 설정을 단계별로 마쳐 주세요. 중간까지 저장되어 있어
        이어서 할 수 있습니다.
      </p>
      <Link
        to={PATHS.onboarding}
        className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
      >
        초기 설정 이어서 하기
      </Link>
    </Callout>
  )
}

/** Mock 으로 만든 응답에는 mock: true 표식이 붙어 있다. 실제 서버 응답에는 없다. */
function isSample(summary: DashboardSummary): boolean {
  return 'mock' in summary && summary.mock === true
}

/**
 * 메인 대시보드. 데이터는 DashboardService(api.dashboard)로만 가져온다.
 *
 * 화면 상태
 *  Loading : 처음 불러오는 중
 *  Success : 정상적으로 불러옴
 *  Empty   : 등록된 센서가 없음 (오류가 아니라 "시작 전")
 *  Error   : 불러오지 못함. 받아 둔 정보가 있으면 "마지막으로 받은 정보"로만 보여 준다
 *  Offline : 연결이 끊김. 받아 둔 정보는 "지금 상태"가 아니라고 밝히고, 상태 카드는 "연결 끊김"이 된다
 */
export function DashboardPage() {
  const query = useDashboard()
  const connection = useConnection()
  const now = useNow()

  const summary = query.data
  const offline = connection.state === 'disconnected' || connection.state === 'unknown'

  if (summary === undefined) {
    return (
      <div className="space-y-4">
        <GreetingHeader now={now} monitoring={null} lastDataAt={undefined} />
        {offline ? (
          <DashboardOffline detail={connection.detail} />
        ) : query.isError ? (
          <DashboardError error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DashboardLoading />
        )}
      </div>
    )
  }

  const counts = countSensors(summary.sensors)
  if (summary.sensors.length === 0) {
    return (
      <div className="space-y-4">
        <GreetingHeader now={now} monitoring="inactive" lastDataAt={null} stale={offline} />
        {offline ? <DashboardOffline detail={connection.detail} /> : <DashboardEmpty />}
        <DeliveryLimitNotice />
        <SetupReminder />
      </div>
    )
  }

  // 연결이 끊겼거나 갱신에 실패했다면, 받아 둔 정보는 "지금 상태"가 아니다.
  const stale = offline || query.isError
  const current = deriveOverallStatus(summary.sensors, summary.activeAlerts)
  const model = offline
    ? unavailableStatus(
        connection.state === 'disconnected' ? 'disconnected' : 'unknown',
        connection.detail,
        current,
      )
    : query.isError
      ? unknownOverallStatus('최신 정보를 불러오지 못했습니다.', current)
      : current

  return (
    <div className="space-y-4">
      <GreetingHeader
        now={now}
        monitoring={monitoringState(counts)}
        lastDataAt={summary.lastDataAt}
        stale={stale}
      />

      {query.isError && !offline ? (
        <ErrorState
          variant="panel"
          title="최신 정보를 불러오지 못했습니다"
          message={`아래 내용은 ${formatClock(new Date(summary.generatedAt))}에 받은 정보이며 지금 상태가 아닐 수 있습니다. ${query.error.message}`}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      <OverallStatus
        model={model}
        updatedAt={summary.generatedAt}
        alertCount={stale ? 0 : summary.activeAlerts.length}
      />

      {isSample(summary) ? (
        <Callout tone="warn" title="개발용 샘플 데이터입니다">
          <p className="text-body-sm">
            화면 확인을 위한 예시이며 실제 센서·움직임이 아닙니다. 이름에 (샘플)이 붙어 있습니다.
          </p>
        </Callout>
      ) : null}
      <DeliveryLimitNotice />
      <SetupReminder />

      <div className="grid gap-4 lg:grid-cols-2">
        <MonitoringCard summary={summary} now={now} stale={stale} />
        <RecentMovements summary={summary} stale={stale} />
        <ZoneSensors summary={summary} stale={stale} />
        <WeeklySummary days={summary.weekly} today={kstDateString(now)} stale={stale} />
      </div>

      <QuickActions />

      <p className="text-body-sm text-ink-muted">
        이 화면은 센서가 보낸 움직임 신호를 보여 줄 뿐, 어르신의 안전을 보장하지 않습니다.
        걱정되시면 직접 확인해 주세요.
      </p>
    </div>
  )
}
