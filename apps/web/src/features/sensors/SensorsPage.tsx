import { Link } from 'react-router'
import { MAX_SENSORS_PER_HOUSEHOLD, ZONE_LABELS, type Sensor } from '@tetris/shared'
import { PAGE_TITLES, PATHS } from '@/app/paths'
import { QueryState } from '@/components/common/QueryState'
import { EmptyState } from '@/components/common/StateViews'
import { Callout } from '@/components/ui/Callout'
import { PageHeader } from '@/components/ui/PageHeader'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useSensors } from './hooks'
import { hasRecentReceiveError } from './sensorHealth'
import { SensorHealthNotes } from './SensorHealthNotes'
import { SENSOR_KIND_LABELS, isLowBattery } from './sensorStatus'
import { BatteryWarning, SensorStatusBadges } from './SensorStatusBadges'

/** 센서 한 대의 카드: 이름·위치·유형·사용 여부, 연결과 배터리, 마지막 통신 시각, 상세 설정 버튼 */
export function SensorCard({ sensor }: { sensor: Sensor }) {
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3">{sensor.name}</h2>
          <p className="text-body text-ink-muted">
            {ZONE_LABELS[sensor.zone]} · {SENSOR_KIND_LABELS[sensor.kind]} ·{' '}
            {sensor.isActive ? '사용 중' : '사용 안 함'}
          </p>
        </div>
        <Link
          to={PATHS.sensorDetail(sensor.id)}
          aria-label={`${sensor.name} 상세 설정`}
          className={buttonStyles({ variant: 'secondary', size: 'sm' })}
        >
          상세 설정
        </Link>
      </div>
      <SensorStatusBadges sensor={sensor} />
      <BatteryWarning sensor={sensor} />
      <SensorHealthNotes sensor={sensor} />
      <p className="text-body-sm text-ink-muted">
        {sensor.lastSeenAt
          ? `마지막 통신 ${formatRelative(sensor.lastSeenAt)} (${formatDateTime(sensor.lastSeenAt)})`
          : '아직 신호를 받지 못했습니다'}
      </p>
    </li>
  )
}

/** 문제가 있는 센서가 몇 개인지 목록 위에서 먼저 알린다. 문제가 없으면 띄우지 않는다. */
function ProblemSummary({ sensors }: { sensors: readonly Sensor[] }) {
  const active = sensors.filter((sensor) => sensor.isActive)
  const offline = active.filter((sensor) => sensor.state === 'OFFLINE').length
  const lowBattery = active.filter((sensor) => isLowBattery(sensor)).length
  const longSilent = active.filter((sensor) => sensor.longSilent).length
  const receiveErrors = active.filter((sensor) => hasRecentReceiveError(sensor, new Date())).length
  if (offline === 0 && lowBattery === 0 && receiveErrors === 0) return null
  return (
    <Callout tone="warn" title="확인이 필요한 센서가 있습니다">
      <ul className="list-disc space-y-1 pl-5 text-body">
        {offline > 0 ? <li>연결이 끊긴 센서 {offline}개</li> : null}
        {longSilent > 0 ? <li>그중 1시간 넘게 신호가 없는 센서 {longSilent}개</li> : null}
        {lowBattery > 0 ? <li>배터리가 부족한 센서 {lowBattery}개</li> : null}
        {receiveErrors > 0 ? (
          <li>최근 1시간 안에 받지 못한 데이터가 있는 센서 {receiveErrors}개</li>
        ) : null}
      </ul>
    </Callout>
  )
}

export function SensorsPage() {
  const query = useSensors()
  return (
    <div className="space-y-4">
      <PageHeader
        title={PAGE_TITLES.sensors}
        description="움직임을 감지하는 센서를 등록하고, 연결 상태와 배터리를 확인합니다."
        actions={
          <Link to={PATHS.sensorNew} className={buttonStyles()}>
            센서 등록
          </Link>
        }
      />
      <QueryState
        query={query}
        loadingLabel="센서를 불러오는 중"
        errorTitle="센서를 불러오지 못했습니다"
      >
        {({ sensors }) =>
          sensors.length === 0 ? (
            <EmptyState
              title="등록된 센서가 없습니다"
              description="센서를 등록해야 움직임 신호를 받을 수 있습니다."
              action={
                <Link to={PATHS.sensorNew} className={buttonStyles()}>
                  센서 등록
                </Link>
              }
            />
          ) : (
            <>
              <ProblemSummary sensors={sensors} />
              <ul className="space-y-3">
                {sensors.map((sensor) => (
                  <SensorCard key={sensor.id} sensor={sensor} />
                ))}
              </ul>
              <p className="text-body-sm text-ink-muted">
                센서 {sensors.length}개 (최대 {MAX_SENSORS_PER_HOUSEHOLD}개)
              </p>
            </>
          )
        }
      </QueryState>
    </div>
  )
}
