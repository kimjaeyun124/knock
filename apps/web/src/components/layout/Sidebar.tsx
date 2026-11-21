import { NavLink } from 'react-router'
import { PATHS } from '@/app/paths'
import { cn } from '@/lib/cn'
import type { NavItem } from '@/types/nav'
import { Logo } from './Logo'
import { MAIN_NAV, SETTINGS_NAV } from './navItems'

const LINK_BASE = 'flex min-h-12 items-center gap-3 rounded-full px-4 text-body font-semibold'

/** 현재 위치: 색뿐 아니라 꽉 찬 바탕과 굵은 글씨로 구분한다. (NavLink 가 aria-current 도 붙인다) */
const LINK_ACTIVE = 'bg-brand-soft text-brand-strong'
const LINK_IDLE = 'text-ink-muted hover:bg-brand-soft hover:text-brand-strong'

function SidebarLink({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end ?? false}
      className={({ isActive }) => cn(LINK_BASE, isActive ? LINK_ACTIVE : LINK_IDLE)}
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          {label}
          {/* 현재 위치: 색 + 굵은 글씨 + 오른쪽 점 (NavLink 가 aria-current 도 붙인다) */}
          {isActive ? (
            <span aria-hidden="true" className="ml-auto size-2 rounded-full bg-brand" />
          ) : null}
        </>
      )}
    </NavLink>
  )
}

/** 데스크톱·태블릿의 고정 사이드바. 스크롤해도 제자리에 있다. */
export function Sidebar() {
  return (
    <aside className="hidden bg-canvas md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:overflow-y-auto">
      <div className="px-4 pt-5 pb-4">
        <Logo />
      </div>
      <nav aria-label="주요 메뉴" className="flex flex-1 flex-col gap-1 px-3 pb-4">
        {MAIN_NAV.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
        {/* 아래쪽: 설정과 서비스 안내 */}
        <div className="mt-auto flex flex-col gap-1 pt-3">
          <SidebarLink {...SETTINGS_NAV} />
          <NavLink
            to={PATHS.notice}
            className={({ isActive }) =>
              cn(LINK_BASE, 'text-body-sm', isActive ? LINK_ACTIVE : LINK_IDLE)
            }
          >
            서비스 안내와 한계
          </NavLink>
        </div>
      </nav>
    </aside>
  )
}
