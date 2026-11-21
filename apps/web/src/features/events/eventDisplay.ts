import {
  Activity,
  BatteryLow,
  BedDouble,
  DoorOpen,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import type { TimelineAttention, TimelineEvent, TimelineEventType } from '@tetris/shared'
import type { StatusTone } from '@/components/ui/StatusBadge'

/** 이벤트 유형별 아이콘. 색뿐 아니라 모양과 이름으로도 구분된다. */
export const EVENT_ICONS: Record<TimelineEventType, LucideIcon> = {
  BED_EXIT_CANDIDATE: BedDouble,
  MOTION_DETECTED: Activity,
  ENTRANCE_ACTIVITY: DoorOpen,
  SENSOR_OFFLINE: WifiOff,
  SENSOR_RESTORED: Wifi,
  LOW_BATTERY: BatteryLow,
}

/** 주의 수준별 상태 색 */
export const ATTENTION_TONES: Record<TimelineAttention, StatusTone> = {
  NORMAL: 'muted',
  INFO: 'muted',
  NOTICE: 'warn',
  URGENT: 'danger',
}

/** 추정으로 보여 주는 유형. 상세에서 "추정이며 확정이 아니다"라고 따로 알린다. */
export const ESTIMATED_TYPES: readonly TimelineEventType[] = [
  'BED_EXIT_CANDIDATE',
  'ENTRANCE_ACTIVITY',
]

/** 아이콘 원의 색: 복구는 정상(녹색), 그 밖에는 주의 수준을 따른다. */
export function eventTone(event: Pick<TimelineEvent, 'eventType' | 'attention'>): StatusTone {
  return event.eventType === 'SENSOR_RESTORED' ? 'ok' : ATTENTION_TONES[event.attention]
}
