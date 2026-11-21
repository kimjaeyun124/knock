import { CircleHelp, Wifi, WifiOff, type LucideIcon } from 'lucide-react'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import type { ConnectionState } from '@/hooks/connection'
import { useConnection } from '@/hooks/connectionContext'

const STYLE: Record<ConnectionState, { tone: StatusTone; icon?: LucideIcon }> = {
  ok: { tone: 'ok', icon: Wifi },
  connecting: { tone: 'checking' },
  disconnected: { tone: 'danger', icon: WifiOff },
  unknown: { tone: 'warn', icon: CircleHelp },
}

/**
 * 시스템 연결 상태: 정상 · 연결 중 · 연결 끊김 · 연결 확인 불가.
 * 색·아이콘·글자로 함께 알리고, 바뀌면 스크린리더에도 읽어 준다(role="status").
 */
export function ConnectionStatus() {
  const { state, label, detail } = useConnection()
  const { tone, icon } = STYLE[state]
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusBadge tone={tone} {...(icon ? { icon } : {})}>
        {label}
      </StatusBadge>
      <span className="text-body-sm text-ink-muted">{detail}</span>
    </div>
  )
}
