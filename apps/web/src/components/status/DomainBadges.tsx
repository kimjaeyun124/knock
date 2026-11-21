import {
  BatteryFull,
  BatteryLow,
  BatteryWarning,
  BellRing,
  CircleCheck,
  FlaskConical,
  Hourglass,
  Info,
  Radio,
  TriangleAlert,
  Unplug,
  WifiOff,
  PowerOff,
  Battery,
  type LucideIcon,
} from 'lucide-react'
import {
  INTEGRATION_MODE_LABELS,
  SENSOR_STATE_LABELS,
  type AlertSeverity,
  type BatteryLevel,
  type DataOrigin,
  type IntegrationMode,
  type SensorState,
} from '@tetris/shared'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { BATTERY_LABELS, ORIGIN_LABELS, SAMPLE_DATA_LABEL, SEVERITY_LABELS } from '@/lib/labels'

interface Appearance {
  tone: StatusTone
  icon: LucideIcon
}

const SEVERITY: Record<AlertSeverity, Appearance> = {
  INFO: { tone: 'muted', icon: Info },
  NOTICE: { tone: 'warn', icon: TriangleAlert },
  URGENT: { tone: 'danger', icon: BellRing },
}

const SENSOR_STATE: Record<SensorState, Appearance> = {
  PENDING: { tone: 'muted', icon: Hourglass },
  ONLINE: { tone: 'ok', icon: CircleCheck },
  OFFLINE: { tone: 'danger', icon: WifiOff },
  DISABLED: { tone: 'muted', icon: PowerOff },
}

const BATTERY: Record<BatteryLevel, Appearance> = {
  UNKNOWN: { tone: 'muted', icon: Battery },
  OK: { tone: 'ok', icon: BatteryFull },
  LOW: { tone: 'warn', icon: BatteryLow },
  CRITICAL: { tone: 'danger', icon: BatteryWarning },
}

const INTEGRATION: Record<IntegrationMode, Appearance> = {
  REAL: { tone: 'ok', icon: CircleCheck },
  MOCK: { tone: 'warn', icon: FlaskConical },
  NOT_CONFIGURED: { tone: 'muted', icon: Unplug },
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { tone, icon } = SEVERITY[severity]
  return (
    <StatusBadge tone={tone} icon={icon}>
      {SEVERITY_LABELS[severity]}
    </StatusBadge>
  )
}

export function SensorStateBadge({ state }: { state: SensorState }) {
  const { tone, icon } = SENSOR_STATE[state]
  return (
    <StatusBadge tone={tone} icon={icon}>
      {SENSOR_STATE_LABELS[state]}
    </StatusBadge>
  )
}

/** 배터리 정보가 없으면 퍼센트를 지어내지 않고 "배터리 정보 없음"으로 표시한다. */
export function BatteryBadge({ level, percent }: { level: BatteryLevel; percent: number | null }) {
  const { tone, icon } = BATTERY[level]
  const showPercent = level !== 'UNKNOWN' && percent !== null
  return (
    <StatusBadge tone={tone} icon={icon}>
      {BATTERY_LABELS[level]}
      {showPercent ? ` (${percent}%)` : ''}
    </StatusBadge>
  )
}

export function IntegrationModeBadge({ mode }: { mode: IntegrationMode }) {
  const { tone, icon } = INTEGRATION[mode]
  return (
    <StatusBadge tone={tone} icon={icon}>
      {INTEGRATION_MODE_LABELS[mode]}
    </StatusBadge>
  )
}

/** 시뮬레이션 데이터는 실제 센서 데이터와 섞여 보이지 않도록 항상 표시한다. */
export function DataOriginBadge({ origin }: { origin: DataOrigin }) {
  return origin === 'SIMULATED' ? (
    <StatusBadge tone="warn" icon={FlaskConical}>
      {ORIGIN_LABELS.SIMULATED}
    </StatusBadge>
  ) : (
    <StatusBadge tone="muted" icon={Radio}>
      {ORIGIN_LABELS.REAL}
    </StatusBadge>
  )
}

/** Mock(샘플 데이터)으로 동작 중인 화면에 붙인다. 실제 데이터로 오해하지 않게 한다. */
export function SampleBadge() {
  return (
    <StatusBadge tone="warn" icon={FlaskConical}>
      {SAMPLE_DATA_LABEL}
    </StatusBadge>
  )
}
