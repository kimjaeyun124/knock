import { Bell, History, Radio, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { PAGE_TITLES, PATHS } from '@/app/paths'
import { Card } from '@/components/ui/Card'

const ACTIONS: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: PATHS.sensors, label: PAGE_TITLES.sensors, hint: '센서 확인·등록', icon: Radio },
  { to: PATHS.settingsNotifications, label: '알림 설정', hint: '알림 받는 방법', icon: Bell },
  { to: PATHS.events, label: '전체 기록 확인', hint: '날짜·구역별 기록', icon: History },
]

/** 자주 하는 일로 바로 가는 큰 버튼 */
export function QuickActions() {
  return (
    <Card title="빠른 작업">
      <ul className="grid gap-3 sm:grid-cols-3">
        {ACTIONS.map(({ to, label, hint, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex min-h-16 items-center gap-3 rounded-control border border-line-strong bg-surface px-4 py-3 hover:bg-brand-soft"
            >
              <Icon aria-hidden="true" className="size-6 shrink-0 text-brand-strong" />
              <span>
                <span className="block text-body font-semibold">{label}</span>
                <span className="block text-body-sm text-ink-muted">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
