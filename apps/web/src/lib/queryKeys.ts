import type { EventsQuery, TimelineFilter, TimelineQuery } from '@tetris/shared'
import type { AlertListFilter } from '@/services/api/types'

/** TanStack Query 키 모음. 실시간 이벤트가 어떤 화면 데이터를 새로 고칠지 여기서 정해진다. */
export const queryKeys = {
  health: ['health'] as const,
  household: ['household'] as const,
  setupStatus: ['auth', 'setup-status'] as const,
  sensors: {
    all: ['sensors'] as const,
    list: ['sensors', 'list'] as const,
    detail: (id: string) => ['sensors', 'detail', id] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    unread: ['alerts', 'unread'] as const,
    list: (filter: AlertListFilter) => ['alerts', 'list', filter] as const,
    detail: (id: string) => ['alerts', 'detail', id] as const,
    clips: (id: string) => ['alerts', 'clips', id] as const,
  },
  events: {
    all: ['events'] as const,
    list: (query: EventsQuery) => ['events', 'list', query] as const,
  },
  dashboard: ['dashboard'] as const,
  timeline: {
    all: ['timeline'] as const,
    list: (query: TimelineQuery) => ['timeline', 'list', query] as const,
    summary: (filter: TimelineFilter) => ['timeline', 'summary', filter] as const,
    detail: (id: string) => ['timeline', 'detail', id] as const,
  },
  settings: {
    detection: ['settings', 'detection'] as const,
    alerts: ['settings', 'alerts'] as const,
  },
  integrations: ['integrations'] as const,
  features: ['system', 'features'] as const,
  sensorAdapters: ['system', 'sensor-adapters'] as const,
  backupStatus: ['system', 'backup'] as const,
  pushConfig: ['push', 'config'] as const,
  pushSubscriptions: ['push', 'subscriptions'] as const,
  dataSummary: ['data', 'summary'] as const,
  simulator: ['simulator', 'state'] as const,
}
