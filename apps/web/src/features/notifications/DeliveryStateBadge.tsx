import {
  CircleHelp,
  Hourglass,
  Send,
  SendHorizontal,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { DeliveryDisplayState } from '@tetris/shared'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { DELIVERY_DISPLAY_LABELS } from '@/lib/labels'

const STYLE: Record<DeliveryDisplayState, { tone: StatusTone; icon: LucideIcon }> = {
  WAITING: { tone: 'muted', icon: Hourglass },
  ATTEMPTING: { tone: 'checking', icon: Send },
  SENT: { tone: 'ok', icon: SendHorizontal },
  UNVERIFIED: { tone: 'warn', icon: CircleHelp },
  FAILED: { tone: 'danger', icon: TriangleAlert },
}

/**
 * 알림 전달 상태 배지: 대기 · 전송 시도 · 전송 성공 · 전달 확인 불가 · 전송 실패.
 * "전달 확인 불가"는 외부 서비스에 넘겼지만 기기에 도착했는지 알 수 없다는 뜻이다. 성공이라고 쓰지 않는다.
 */
export function DeliveryStateBadge({ state }: { state: DeliveryDisplayState }) {
  const { tone, icon } = STYLE[state]
  return (
    <StatusBadge tone={tone} icon={icon} size="sm">
      {DELIVERY_DISPLAY_LABELS[state]}
    </StatusBadge>
  )
}
