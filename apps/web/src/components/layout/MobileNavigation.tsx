import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import { MOBILE_NAV } from './navItems'

/**
 * 모바일 하단 메뉴. 핵심 화면 4개와 설정이 항상 손 닿는 곳에 있다.
 * 세부 설정(감지 시간, 알림 채널 등)은 "설정" 화면에서 별도 페이지로 이동한다.
 * 터치 영역 56px, 현재 위치는 아이콘 뒤의 알약 모양 + 굵은 글씨 + 색으로 구분한다.
 */
export function MobileNavigation() {
  return (
    <nav
      aria-label="하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {MOBILE_NAV.map(({ to, shortLabel, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end ?? false}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 py-1 text-caption font-semibold',
              isActive ? 'text-brand-strong' : 'text-ink-muted',
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* 현재 위치: 아이콘 뒤의 알약 모양 + 굵은 글씨 + 색 */}
              <span
                className={cn(
                  'grid h-8 w-14 place-items-center rounded-full',
                  isActive ? 'bg-brand-soft text-brand-strong' : '',
                )}
              >
                <Icon aria-hidden="true" className="size-6" />
              </span>
              {shortLabel}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
