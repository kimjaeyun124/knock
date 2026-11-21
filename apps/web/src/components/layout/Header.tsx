import { AccountMenu } from '@/features/auth/AccountMenu'
import { Logo } from './Logo'
import { NotificationTrigger } from './NotificationTrigger'
import { StatusStrip } from './StatusStrip'

/**
 * 모든 화면 위쪽의 공통 헤더.
 *  - 모바일: 로고 · 알림 · 계정이 윗줄, 시스템 상태(연결·센서·알림 전달)가 아랫줄
 *  - 데스크톱: 로고는 사이드바에 있으므로 시스템 상태가 왼쪽, 알림·계정이 오른쪽 (스크롤해도 위에 붙어 있다)
 */
export function Header() {
  return (
    <header className="bg-canvas md:sticky md:top-0 md:z-20">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 md:px-8">
        <Logo className="md:hidden" />
        <StatusStrip className="order-last basis-full md:order-none md:min-w-0 md:flex-1 md:basis-0" />
        <div className="ml-auto flex items-center gap-2">
          <NotificationTrigger />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
