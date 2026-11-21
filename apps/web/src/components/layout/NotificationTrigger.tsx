import { Bell, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { PATHS } from '@/app/paths'
import { useUnreadCount } from '@/features/notifications/hooks'
import { useConnection } from '@/hooks/connectionContext'

const BADGE =
  'absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full px-1 text-caption font-bold text-ink-inverse'

/**
 * 알림 센터로 가는 종 버튼. 내가 읽지 않은 알림 수를 숫자로 보여 준다. (중요 알림이 있으면 붉은색)
 * 읽음은 해결과 다르므로, 숫자가 0이어도 진행 중인 알림이 남아 있을 수 있다.
 * 수를 불러오지 못했거나 연결이 정상이 아니면 "0건"처럼 보이지 않고 경고 표시로 알린다.
 * 스크린리더가 읽는 이름에 눈에 보이는 숫자가 그대로 들어 있도록, 이름은 글자(sr-only)와 숫자로 이어 만든다.
 */
export function NotificationTrigger() {
  const count = useUnreadCount()
  const { state } = useConnection()

  const unavailable = count.isError || state === 'disconnected' || state === 'unknown'
  const open = count.data?.unread ?? 0
  const important = (count.data?.unreadImportant ?? 0) > 0

  return (
    <Link
      to={PATHS.notifications}
      className="relative inline-flex size-12 items-center justify-center rounded-control border border-line hover:bg-canvas"
    >
      <Bell aria-hidden="true" className="size-5" />
      {unavailable ? (
        <>
          <span className="sr-only">알림 센터. 새 알림을 확인하지 못하고 있습니다</span>
          <span aria-hidden="true" className={`${BADGE} bg-status-warn`}>
            <TriangleAlert className="size-3.5" />
          </span>
        </>
      ) : open > 0 ? (
        <>
          <span className="sr-only">알림 센터. 읽지 않은 알림 </span>
          <span className={`${BADGE} ${important ? 'bg-status-danger' : 'bg-brand'}`}>
            {open > 99 ? '99+' : open}
            <span className="sr-only">건</span>
          </span>
        </>
      ) : (
        <span className="sr-only">알림 센터</span>
      )}
    </Link>
  )
}
