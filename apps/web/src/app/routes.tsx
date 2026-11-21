import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router'
import { NotFoundPage } from '@/components/common/NotFoundPage'
import { ScreenLoading } from '@/components/common/ScreenLoading'
import { RouteErrorPage } from '@/components/common/RouteErrorPage'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { LegacyRedirect } from './LegacyRedirect'
import { LEGACY_PATHS, PAGE_TITLES, PATHS } from './paths'
import { RootLayout } from './RootLayout'
import type { RouteHandle } from './routeHandle'

/**
 * 처음 화면(로그인·대시보드·설정 목록) 외의 화면은 들어갈 때 불러온다. (경로별 코드 분할)
 * 처음 내려받는 자바스크립트가 줄어 느린 회선·오래된 기기에서도 첫 화면이 빨리 뜬다.
 * 불러오다 실패하면(네트워크 끊김 등) 경로의 errorElement 가 오류를 알린다.
 */
function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => ({ Component: (await load())[name] }),
  }
}

/** 화면 이름·이동 경로·본문 너비를 경로에 붙인다. (RouteHandle 형식을 지키는지 컴파일러가 확인한다) */
const handle = (value: RouteHandle): { handle: RouteHandle } => ({ handle: value })

/** 설정 하위 화면의 이동 경로는 "설정 > 화면 이름" 이 된다. */
const underSettings = (title: string): RouteHandle => ({
  title,
  parent: { title: PAGE_TITLES.settings, to: PATHS.settings },
})

/**
 * 경로 정의. 브라우저·테스트(메모리 라우터)가 같은 정의를 쓴다.
 *
 *   /login /register /notice       로그인 없이 열린다
 *   그 밖의 모두                    RequireAuth(로그인 확인) → AppShell(공통 레이아웃) 안에서 열린다
 *
 * 인증 방식을 바꾸거나 권한(예: 보호자만/관리자)을 나누려면 RequireAuth 한 곳만 고치면 된다.
 * 새 화면을 추가하려면 paths.ts 에 경로·이름을 적고, 아래 AppShell 의 children 에 한 줄을 더한다.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      // ── 로그인 없이 열리는 화면 ─────────────────────────
      { path: PATHS.login, element: <LoginPage />, ...handle({ title: '로그인' }) },
      {
        // 서버에 보호자가 없을 때만 열리는 첫 계정 만들기
        path: PATHS.register,
        HydrateFallback: ScreenLoading,
        ...handle({ title: '첫 계정 만들기' }),
        ...lazyPage(() => import('@/features/onboarding/RegisterPage'), 'RegisterPage'),
      },
      {
        // 서비스의 한계를 알리는 안내는 로그인하지 않아도 볼 수 있어야 한다.
        path: PATHS.notice,
        HydrateFallback: ScreenLoading,
        ...handle({ title: PAGE_TITLES.notice }),
        ...lazyPage(() => import('@/features/notice/NoticePage'), 'NoticePage'),
      },

      // ── 로그인한 보호자만 볼 수 있는 화면 ─────────────────
      {
        path: '/',
        element: <RequireAuth />,
        HydrateFallback: ScreenLoading,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                index: true,
                element: <DashboardPage />,
                ...handle({ title: PAGE_TITLES.dashboard, width: 'wide' }),
              },
              {
                path: 'sensors',
                ...handle({ title: PAGE_TITLES.sensors }),
                children: [
                  {
                    index: true,
                    ...lazyPage(() => import('@/features/sensors/SensorsPage'), 'SensorsPage'),
                  },
                  {
                    path: 'new',
                    ...handle({ title: PAGE_TITLES.sensorNew }),
                    ...lazyPage(() => import('@/features/sensors/SensorNewPage'), 'SensorNewPage'),
                  },
                  {
                    path: ':sensorId',
                    ...handle({ title: PAGE_TITLES.sensorDetail }),
                    ...lazyPage(
                      () => import('@/features/sensors/SensorDetailPage'),
                      'SensorDetailPage',
                    ),
                  },
                ],
              },
              {
                path: 'events',
                ...handle({ title: PAGE_TITLES.events, width: 'wide' }),
                ...lazyPage(() => import('@/features/events/EventsPage'), 'EventsPage'),
              },
              {
                path: 'notifications',
                ...handle({ title: PAGE_TITLES.notifications }),
                children: [
                  {
                    index: true,
                    ...lazyPage(
                      () => import('@/features/notifications/NotificationsPage'),
                      'NotificationsPage',
                    ),
                  },
                  {
                    path: ':alertId',
                    ...handle({ title: PAGE_TITLES.notificationDetail }),
                    ...lazyPage(
                      () => import('@/features/notifications/AlertDetailPage'),
                      'AlertDetailPage',
                    ),
                  },
                ],
              },
              {
                path: 'settings',
                ...handle({ title: PAGE_TITLES.settings }),
                children: [
                  {
                    index: true,
                    ...lazyPage(
                      () => import('@/features/settings/overview/SettingsOverviewPage'),
                      'SettingsOverviewPage',
                    ),
                  },
                  {
                    path: 'detection',
                    ...handle({ title: PAGE_TITLES.settingsDetection }),
                    ...lazyPage(
                      () => import('@/features/settings/DetectionSettingsPage'),
                      'DetectionSettingsPage',
                    ),
                  },
                  {
                    path: 'notifications',
                    ...handle({ title: PAGE_TITLES.settingsNotifications }),
                    ...lazyPage(
                      () => import('@/features/settings/NotificationSettingsPage'),
                      'NotificationSettingsPage',
                    ),
                  },
                  {
                    path: 'integrations',
                    ...handle({ title: PAGE_TITLES.settingsIntegrations }),
                    ...lazyPage(
                      () => import('@/features/settings/IntegrationsPage'),
                      'IntegrationsPage',
                    ),
                  },
                  {
                    path: 'guide',
                    ...handle({ title: PAGE_TITLES.settingsGuide }),
                    ...lazyPage(
                      () => import('@/features/settings/DetectionGuidePage'),
                      'DetectionGuidePage',
                    ),
                  },
                  {
                    path: 'password',
                    ...handle({ title: PAGE_TITLES.settingsPassword }),
                    ...lazyPage(() => import('@/features/settings/PasswordPage'), 'PasswordPage'),
                  },
                  {
                    path: 'data',
                    ...handle({ title: PAGE_TITLES.settingsData }),
                    ...lazyPage(() => import('@/features/settings/DataPage'), 'DataPage'),
                  },
                ],
              },
              {
                path: 'onboarding',
                ...handle({ title: PAGE_TITLES.onboarding }),
                ...lazyPage(() => import('@/features/onboarding/OnboardingPage'), 'OnboardingPage'),
              },

              // 개발·시연용
              {
                path: 'dev/design',
                ...handle(underSettings(PAGE_TITLES.devDesign)),
                ...lazyPage(() => import('@/features/design/DesignPage'), 'DesignPage'),
              },
              {
                path: 'dev/webcam',
                ...handle(underSettings(PAGE_TITLES.devWebcam)),
                ...lazyPage(() => import('@/features/webcam/WebcamPage'), 'WebcamPage'),
              },
              {
                path: 'dev/simulator',
                ...handle(underSettings(PAGE_TITLES.devSimulator)),
                ...lazyPage(() => import('@/features/simulator/SimulatorPage'), 'SimulatorPage'),
              },

              // ── 예전 주소 → 새 주소 (푸시 알림·북마크 호환) ──
              {
                path: LEGACY_PATHS.alerts,
                element: <LegacyRedirect to={PATHS.notifications} />,
              },
              {
                path: `${LEGACY_PATHS.alerts}/:alertId`,
                element: <LegacyRedirect to="/notifications/:alertId" />,
              },
              { path: LEGACY_PATHS.history, element: <LegacyRedirect to={PATHS.events} /> },
              { path: LEGACY_PATHS.setup, element: <LegacyRedirect to={PATHS.onboarding} /> },

              { path: '*', element: <NotFoundPage />, ...handle({ title: PAGE_TITLES.notFound }) },
            ],
          },
        ],
      },
    ],
  },
]
