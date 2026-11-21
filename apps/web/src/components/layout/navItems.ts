import { Bell, History, LayoutDashboard, Radio, Settings } from 'lucide-react'
import { PAGE_TITLES, PATHS } from '@/app/paths'
import type { NavItem } from '@/types/nav'

/** 날마다 쓰는 핵심 메뉴 (사이드바 위쪽, 하단 메뉴) */
export const MAIN_NAV: readonly NavItem[] = [
  {
    to: PATHS.dashboard,
    label: PAGE_TITLES.dashboard,
    shortLabel: '홈',
    icon: LayoutDashboard,
    end: true,
  },
  { to: PATHS.sensors, label: PAGE_TITLES.sensors, shortLabel: '센서', icon: Radio },
  { to: PATHS.events, label: PAGE_TITLES.events, shortLabel: '기록', icon: History },
  { to: PATHS.notifications, label: PAGE_TITLES.notifications, shortLabel: '알림', icon: Bell },
]

/** 사이드바 맨 아래에 두는 설정 메뉴. 세부 설정은 이 화면에서 별도 페이지로 이동한다. */
export const SETTINGS_NAV: NavItem = {
  to: PATHS.settings,
  label: PAGE_TITLES.settings,
  shortLabel: PAGE_TITLES.settings,
  icon: Settings,
}

/** 모바일 하단 메뉴: 핵심 메뉴 + 설정 */
export const MOBILE_NAV: readonly NavItem[] = [...MAIN_NAV, SETTINGS_NAV]
