import { BatteryLow, PowerOff } from 'lucide-react'
import type { Sensor } from '@tetris/shared'
import { BatteryBadge, DataOriginBadge, SensorStateBadge } from '@/components/status/DomainBadges'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { isLowBattery, sensorDisplayStatus } from './sensorStatus'

/**
 * 센서의 연결 상태와 배터리를 따로 보여 준다. 두 값은 서로 독립이라,
 * "연결됨 + 배터리 부족"도, "연결 끊김 + 배터리 충분"도 그대로 표현된다.
 */
export function SensorStatusBadges({ sensor }: { sensor: Sensor }) {
  const disabled = sensorDisplayStatus(sensor) === 'DISABLED'
  return (
    <div className="flex flex-wrap items-center gap-2">
      {disabled ? (
        <StatusBadge tone="muted" icon={PowerOff}>
          사용 안 함
        </StatusBadge>
      ) : (
        <SensorStateBadge state={sensor.state} />
      )}
      <BatteryBadge level={sensor.batteryLevel} percent={sensor.batteryPercent} />
      {sensor.origin === 'SIMULATED' ? <DataOriginBadge origin="SIMULATED" /> : null}
    </div>
  )
}

/** 배터리가 부족하거나 위급하면 무엇을 해야 하는지 글로 알린다. 충분하거나 정보가 없으면 아무것도 띄우지 않는다. */
export function BatteryWarning({ sensor }: { sensor: Sensor }) {
  if (!sensor.isActive || !isLowBattery(sensor)) return null
  const critical = sensor.batteryLevel === 'CRITICAL'
  return (
    <p
      className={`flex items-start gap-2 text-body-sm font-semibold ${critical ? 'text-status-danger-strong' : 'text-status-warn-strong'}`}
    >
      <BatteryLow aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {critical
        ? '배터리가 거의 남지 않았습니다. 곧 신호가 끊길 수 있으니 바로 교체하거나 충전해 주세요.'
        : '배터리가 부족합니다. 곧 교체하거나 충전해 주세요.'}
    </p>
  )
}
