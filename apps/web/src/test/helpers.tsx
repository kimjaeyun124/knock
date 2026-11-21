import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router'
import {
  AlertListResponseSchema,
  DailySummaryResponseSchema,
  DetectionSettingsSchema,
  EventsResponseSchema,
  SensorListResponseSchema,
  buildDashboardSummary,
} from '@tetris/shared'
import { vi } from 'vitest'
import { routes } from '@/app/routes'
import { ApiProvider } from '@/app/ApiProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { createQueryClient } from '@/lib/queryClient'
import { kstDateString } from '@/lib/format'
import { createHttpApiClient } from '@/services/api/http'
import { ALERT_PREFERENCES, DETECTION_SETTINGS, TIMELINE_SUMMARY } from './fixtures'
import type { ApiRuntime } from '@/services/api/runtime'

export const HEALTH_BODY = {
  status: 'ok',
  service: 'tetris-server',
  version: '0.1.0',
  timestamp: '2026-11-13T03:00:00.000Z',
  uptimeSeconds: 5,
  checks: { database: 'up' },
}

export const SESSION_BODY = {
  guardian: { id: 'g1', email: 'demo@example.com', displayName: '데모 보호자' },
  household: { id: 'h1', name: '데모 가구', recipientAlias: '어르신(데모)' },
}

/** 푸시·문자·카카오가 연동되지 않은 기본 상태 (앱 화면 알림만 실제 연동) */
export const INTEGRATIONS_BODY = {
  integrations: [
    { key: 'IN_APP', mode: 'REAL', lastSuccessAt: null },
    { key: 'WEB_PUSH', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
    { key: 'SMS', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
    { key: 'KAKAO', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
  ],
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

export function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

export interface ApiRequest {
  method: string
  path: string
  /** 쿼리 문자열 (? 포함, 없으면 빈 문자열) */
  search: string
  body: unknown
}
export type ApiHandler = (request: ApiRequest) => Response | Promise<Response>

const DASHBOARD_SUMMARY_KEY = 'GET /api/v1/dashboard/summary'

/**
 * 가짜 서버의 대시보드 요약. 테스트가 센서·움직임·알림·설정·주간 요약 응답을 정해 두었다면,
 * 실제 서버(DashboardService)처럼 그것들을 모아 한 번에 돌려준다.
 * 하나라도 오류이거나 아직 응답하지 않으면 요약도 그렇게 된다. (일부만 채운 응답을 만들지 않는다)
 */
function dashboardFromHandlers(handlers: Record<string, ApiHandler>): ApiHandler {
  return async () => {
    const call = (key: string, search = ''): Promise<Response> | Response => {
      const handler = handlers[key]
      if (!handler) return errorResponse(404, 'NOT_FOUND', `테스트에 정의되지 않은 요청: ${key}`)
      const [method = 'GET', path = ''] = key.split(' ')
      return handler({ method, path, search, body: undefined })
    }
    const responses = await Promise.all([
      call('GET /api/sensors'),
      call('GET /api/events', '?limit=5'),
      call('GET /api/alerts', '?limit=100&status=OPEN%2CACKNOWLEDGED'),
      call('GET /api/settings/detection'),
      call('GET /api/events/daily', '?days=7'),
    ])
    const failed = responses.find((response) => !response.ok)
    if (failed) return failed
    const [sensors, events, alerts, settings, weekly] = await Promise.all(
      responses.map((response) => response.json() as Promise<unknown>),
    )
    return jsonResponse({
      data: buildDashboardSummary({
        now: new Date(),
        sensors: SensorListResponseSchema.parse(sensors).sensors,
        recentEvents: EventsResponseSchema.parse(events).events,
        activeAlerts: AlertListResponseSchema.parse(alerts).alerts.map(
          ({ read: _read, ...alert }) => alert,
        ),
        settings: DetectionSettingsSchema.parse(settings),
        weekly: DailySummaryResponseSchema.parse(weekly).days,
      }),
    })
  }
}

/**
 * 경로별 응답을 정해 두는 fetch 대역. 키는 "GET /api/health" 형식.
 * 정해 두지 않은 요청은 404 를 돌려주고 호출 기록에 남는다.
 * 대시보드 요약(GET /api/v1/dashboard/summary)은 따로 정하지 않으면 위 응답들을 모아 만든다.
 */
export function stubApi(handlers: Record<string, ApiHandler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(href, 'http://localhost')
    const method = init?.method ?? 'GET'
    const key = `${method} ${url.pathname}`
    const handler =
      handlers[key] ?? (key === DASHBOARD_SUMMARY_KEY ? dashboardFromHandlers(handlers) : undefined)
    if (!handler)
      return errorResponse(
        404,
        'NOT_FOUND',
        `테스트에 정의되지 않은 요청: ${method} ${url.pathname}`,
      )
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    return handler({ method, path: url.pathname, search: url.search, body })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** 오늘을 포함한 최근 N일의 날짜별 요약 응답. counts 는 오래된 날부터의 움직임 신호 수(없으면 0). */
export function dailyBody(counts: readonly number[] = [], attention: readonly number[] = []) {
  const days = 7
  return {
    generatedAt: new Date().toISOString(),
    days: Array.from({ length: days }, (_, index) => ({
      date: kstDateString(new Date(Date.now() - (days - 1 - index) * 24 * 60 * 60 * 1000)),
      movements: counts[index] ?? 0,
      simulatedMovements: 0,
      attentionAlerts: attention[index] ?? 0,
    })),
  }
}

/** 로그인되어 있고 서버가 정상인 기본 상태 */
export const loggedInHandlers = (): Record<string, ApiHandler> => ({
  'GET /api/health': () => jsonResponse(HEALTH_BODY),
  'GET /api/auth/me': () => jsonResponse(SESSION_BODY),
  'GET /api/sensors': () => jsonResponse({ sensors: [] }),
  'GET /api/alerts': () => jsonResponse({ alerts: [], nextCursor: null }),
  'GET /api/alerts/unread-count': () => jsonResponse({ unread: 0, unreadImportant: 0 }),
  'GET /api/events': () => jsonResponse({ events: [], nextCursor: null }),
  'GET /api/events/daily': () => jsonResponse(dailyBody()),
  'GET /api/timeline': () => jsonResponse({ events: [], nextCursor: null }),
  'GET /api/timeline/summary': () => jsonResponse(TIMELINE_SUMMARY),
  'GET /api/settings/detection': () => jsonResponse(DETECTION_SETTINGS),
  'GET /api/settings/alerts': () => jsonResponse(ALERT_PREFERENCES),
  'GET /api/system/features': () => jsonResponse({ simulatorEnabled: false }),
  'GET /api/system/integrations': () => jsonResponse(INTEGRATIONS_BODY),
})

/** 실제 서버(fetch)를 쓰는 기본 API 런타임. Mock 으로 바꿀 기능을 지정할 수 있다. */
export function testRuntime(overrides: Partial<ApiRuntime> = {}): ApiRuntime {
  return { mode: 'api', client: createHttpApiClient(), mockFeatures: [], ...overrides }
}

/** 테스트에서는 재시도 없이 바로 결과를 확인한다. */
export function createTestQueryClient() {
  return createQueryClient({ retry: false, staleTime: 0 })
}

export function QueryWrapper({
  children,
  runtime = testRuntime(),
}: {
  children: ReactNode
  runtime?: ApiRuntime
}) {
  return (
    <ApiProvider runtime={runtime}>
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}

export function renderApp(entry: InitialEntry = '/', runtime: ApiRuntime = testRuntime()) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  const utils = render(
    <QueryWrapper runtime={runtime}>
      <RouterProvider router={router} />
    </QueryWrapper>,
  )
  return { ...utils, router }
}
