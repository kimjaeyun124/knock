import { Outlet } from 'react-router'
import { AlertBanners } from '@/features/notifications/AlertBanners'
import { ConnectionNotice } from './ConnectionNotice'
import { DemoModeBanner } from './DemoModeBanner'
import { SimulatedDataBanner } from './SimulatedDataBanner'
import { ConnectionProvider } from './ConnectionProvider'
import { Header } from './Header'
import { MobileNavigation } from './MobileNavigation'
import { PageContainer } from './PageContainer'
import { RouteAnnouncer } from './RouteAnnouncer'
import { Sidebar } from './Sidebar'

/**
 * 로그인한 뒤 모든 화면을 감싸는 공통 레이아웃.
 *
 *   데스크톱·태블릿          모바일
 *   ┌────────┬──────────┐   ┌───────────────┐
 *   │Sidebar │ Header   │   │ Header        │
 *   │(고정)  ├──────────┤   ├───────────────┤
 *   │        │ 연결 안내 │   │ 연결 안내      │
 *   │        │ 본문      │   │ 본문           │
 *   │ 설정   │          │   ├───────────────┤
 *   └────────┴──────────┘   │ MobileNavigation│
 *                           └───────────────┘
 * 연결 상태는 ConnectionProvider 가 한 번만 계산해 헤더·알림 배지·연결 안내가 함께 쓴다.
 */
export function AppShell() {
  return (
    <ConnectionProvider>
      <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-brand px-4 py-2 text-ink-inverse focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          본문으로 건너뛰기
        </a>
        <Sidebar />
        <div className="flex min-h-dvh min-w-0 flex-col">
          <DemoModeBanner />
          <SimulatedDataBanner />
          <Header />
          <ConnectionNotice />
          <AlertBanners />
          {/* 모바일에서는 고정 하단 메뉴에 가리지 않도록 아래 여백을 넉넉히 둔다 */}
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 px-4 py-6 pb-28 md:px-10 md:py-10 md:pb-10"
          >
            <PageContainer>
              <Outlet />
            </PageContainer>
          </main>
        </div>
        <MobileNavigation />
        <RouteAnnouncer />
      </div>
    </ConnectionProvider>
  )
}
