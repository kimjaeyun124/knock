import type { DashboardSummary } from '@tetris/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Card } from '@/components/ui/Card'
import { countSensors } from '@/features/sensors/sensorStatus'
import { formatDateTime } from '@/lib/format'
import { describeSchedule, isMonitoredNow } from '@/lib/night'
import { formatTimeOfDay } from '@/lib/format'
import { Moon, MoonStar, Sun } from 'lucide-react'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-body-sm text-ink-muted">{label}</dt>
      <dd className="text-body font-semibold text-ink">{children}</dd>
    </div>
  )
}

/** 현재 모니터링: 시작 시간, 감지 일정, 야간 모니터링 여부, 센서 수 */
export function MonitoringCard({
  summary,
  now,
  stale = false,
}: {
  summary: DashboardSummary
  now: Date
  stale?: boolean
}) {
  const counts = countSensors(summary.sensors)
  const { nightStart, nightEnd, monitoringEnabled, activeWeekdays } = summary.schedule
  const night = isMonitoredNow(now, summary.schedule)

  return (
    <Card
      title="현재 모니터링"
      description={stale ? '연결이 끊기기 전에 받은 정보입니다.' : undefined}
    >
      <dl className="divide-y divide-line">
        <Row label="모니터링 시작">
          {summary.monitoringStartedAt ? (
            <>
              {formatDateTime(summary.monitoringStartedAt)}
              <span className="block text-body-sm font-normal text-ink-muted">
                첫 센서를 등록한 시각
              </span>
            </>
          ) : (
            '아직 시작하지 않았습니다'
          )}
        </Row>
        <Row label="감지 일정">
          {monitoringEnabled
            ? describeSchedule(nightStart, nightEnd, activeWeekdays)
            : '모니터링이 꺼져 있습니다'}
        </Row>
        <Row label="야간 모니터링">
          {stale ? (
            <span className="font-normal text-ink-muted">지금은 확인할 수 없습니다</span>
          ) : !monitoringEnabled ? (
            <StatusBadge tone="warn" icon={MoonStar}>
              꺼져 있어 움직임 알림이 만들어지지 않습니다
            </StatusBadge>
          ) : night ? (
            <StatusBadge tone="ok" icon={Moon}>
              지금 야간 시간대입니다
            </StatusBadge>
          ) : (
            <StatusBadge tone="muted" icon={Sun}>
              {formatTimeOfDay(nightStart)}에 시작합니다
              {activeWeekdays.length < 7 ? ' (정해 둔 요일에만)' : ''}
            </StatusBadge>
          )}
        </Row>
        <Row label="연결된 센서">
          {counts.connected}개
          <span className="font-normal text-ink-muted"> / 사용 중 {counts.active}개</span>
        </Row>
        <Row label="정상 작동 중인 센서">
          {counts.working}개
          {counts.connected > counts.working ? (
            <span className="block text-body-sm font-normal text-ink-muted">
              연결은 되어 있지만 배터리가 부족한 센서 {counts.connected - counts.working}개 제외
            </span>
          ) : null}
        </Row>
      </dl>
    </Card>
  )
}
