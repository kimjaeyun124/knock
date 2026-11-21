import { SensorHealthNotes } from '@/features/sensors/SensorHealthNotes'
import { Link } from 'react-router'
import { ZONE_KINDS, ZONE_LABELS, type DashboardSummary } from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { BatteryBadge, DataOriginBadge, SensorStateBadge } from '@/components/status/DomainBadges'
import { Card } from '@/components/ui/Card'
import { formatRelative } from '@/lib/format'

/** 센서 요약: 침대 주변·이동 경로·현관 구역별 연결 상태와 배터리 */
export function ZoneSensors({
  summary,
  stale = false,
}: {
  summary: DashboardSummary
  stale?: boolean
}) {
  return (
    <Card
      title="센서 요약"
      description={stale ? '연결이 끊기기 전에 받은 정보입니다.' : undefined}
      actions={
        <Link
          to={PATHS.sensors}
          className="inline-flex min-h-11 items-center text-body-sm font-semibold text-brand-strong underline"
        >
          센서 관리
        </Link>
      }
    >
      <ul className="divide-y divide-line">
        {ZONE_KINDS.map((zone) => {
          const sensors = summary.sensors.filter((sensor) => sensor.zone === zone)
          return (
            <li key={zone} className="space-y-2 py-3">
              <p className="text-body font-semibold">{ZONE_LABELS[zone]}</p>
              {sensors.length === 0 ? (
                <p className="text-body text-ink-muted">
                  이 구역에는 센서가 없습니다.{' '}
                  <Link to={PATHS.sensorNew} className="font-semibold text-brand-strong underline">
                    센서 등록
                  </Link>
                </p>
              ) : (
                <ul className="space-y-3">
                  {sensors.map((sensor) => (
                    <li key={sensor.id} className="space-y-1">
                      <p className="text-body">
                        <Link
                          to={PATHS.sensorDetail(sensor.id)}
                          className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline"
                        >
                          {sensor.name}
                        </Link>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <SensorStateBadge state={sensor.state} />
                        <BatteryBadge level={sensor.batteryLevel} percent={sensor.batteryPercent} />
                        {sensor.origin === 'SIMULATED' ? (
                          <DataOriginBadge origin="SIMULATED" />
                        ) : null}
                      </div>
                      <SensorHealthNotes sensor={sensor} />
                      <p className="text-body-sm text-ink-muted">
                        {sensor.lastSeenAt
                          ? `마지막 신호 ${formatRelative(sensor.lastSeenAt)}`
                          : '아직 신호를 받지 못했습니다'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
