import { PATHS } from '@/app/paths'
import { X } from 'lucide-react'
import { Link } from 'react-router'
import type { AlertNotifyReason } from '@tetris/shared'
import { SeverityBadge } from '@/components/status/DomainBadges'
import { useAlertNotifications } from './useAlertNotifications'

const REASON_TEXT: Record<AlertNotifyReason, string | null> = {
  NEW: null,
  ESCALATED: '알림 수준이 높아졌습니다.',
  REMINDER: '아직 확인하지 않은 알림입니다.',
}

/**
 * 새 알림이 도착하면 화면 맨 위에 보여 주는 배너.
 * 이 화면이 열려 있을 때만 보이며, 닫혀 있는 보호자에게는 전달되지 않는다.
 */
export function AlertBanners() {
  const { banners, dismiss } = useAlertNotifications()
  if (banners.length === 0) return null

  return (
    <div aria-label="새 알림" className="space-y-2 border-b border-line bg-canvas p-3">
      {banners.map(({ alert, reason }) => (
        <div
          key={alert.id}
          role={alert.severity === 'URGENT' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-control border-2 p-3 ${
            alert.severity === 'URGENT'
              ? 'border-status-danger bg-status-danger-soft'
              : 'border-status-warn bg-status-warn-soft'
          }`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <SeverityBadge severity={alert.severity} />
            <p className="text-lg font-bold">{alert.title}</p>
            {REASON_TEXT[reason] ? <p className="text-sm">{REASON_TEXT[reason]}</p> : null}
            <Link
              to={PATHS.notificationDetail(alert.id)}
              onClick={() => dismiss(alert.id)}
              className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
            >
              알림 보기
            </Link>
          </div>
          <button
            type="button"
            aria-label="배너 닫기"
            onClick={() => dismiss(alert.id)}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-control hover:bg-canvas"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      ))}
    </div>
  )
}
