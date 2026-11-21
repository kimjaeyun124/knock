import {
  AlertDetailResponseSchema,
  AlertListResponseSchema,
  AlertReadAllResponseSchema,
  AlertResponseSchema,
  AlertUnreadCountResponseSchema,
  DailySummaryResponseSchema,
  DashboardSummaryResponseSchema,
  TimelineDetailResponseSchema,
  TimelineResponseSchema,
  TimelineSummaryResponseSchema,
  AlertPreferencesSchema,
  DetectionSettingsSchema,
  DataSummaryResponseSchema,
  DeleteSimulatedResponseSchema,
  EventsResponseSchema,
  ChannelTestResponseSchema,
  FeaturesResponseSchema,
  AlertClipUploadResponseSchema,
  AlertClipsResponseSchema,
  BackupStatusSchema,
  SensorAdaptersResponseSchema,
  IntegrationsResponseSchema,
  PushConfigResponseSchema,
  PushSubscribeResponseSchema,
  PushSubscriptionsResponseSchema,
  LogoutResponseSchema,
  SimulatorStateSchema,
  HouseholdResponseSchema,
  SetupStatusResponseSchema,
  AuthSessionResponseSchema,
  ChangePasswordResponseSchema,
  SensorDeleteResponseSchema,
  SensorListResponseSchema,
  SensorResponseSchema,
  SensorWithTokenResponseSchema,
} from '@tetris/shared'
import { apiRequest } from '../apiClient'
import { fetchSession, login, logout } from '../auth.service'
import { fetchHealth } from '../health.service'
import type { AlertListFilter, ApiClient } from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function withSignal(signal: AbortSignal | undefined): RequestInit {
  return signal ? { signal } : {}
}

function jsonBody(method: 'POST' | 'PUT' | 'PATCH', body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: JSON_HEADERS, body: JSON.stringify(body) }
}

/**
 * 값이 없는 항목(undefined, 빈 문자열)은 빼고 쿼리 문자열을 만든다.
 * 맨 앞에 ?가 붙으며, 항목이 없으면 빈 문자열이다. 문자열·숫자·불리언만 보낸다.
 */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === '') continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      search.set(key, String(value))
    }
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

function alertQuery(filter: AlertListFilter): string {
  const { status, ...rest } = filter
  return toQueryString({ ...rest, status: status?.join(',') })
}

const id = encodeURIComponent

/** 실제 서버를 호출하는 구현. 모든 응답은 공유 스키마로 검증한다. */
export function createHttpApiClient(): ApiClient {
  const client: ApiClient = {
    health: { get: fetchHealth },
    auth: {
      session: fetchSession,
      login,
      logout,
      register: (input) =>
        apiRequest('/api/auth/register', AuthSessionResponseSchema, jsonBody('POST', input)),
      changePassword: (input) =>
        apiRequest('/api/auth/password', ChangePasswordResponseSchema, jsonBody('POST', input)),
      setupStatus: (signal) =>
        apiRequest('/api/auth/setup-status', SetupStatusResponseSchema, withSignal(signal)),
    },
    dashboard: {
      // 서버가 센서·움직임·알림·설정을 한 번에 모아 준다. 하나라도 읽지 못하면 서버가 전체를 실패로 돌려준다.
      summary: async (signal) =>
        (
          await apiRequest(
            '/api/v1/dashboard/summary',
            DashboardSummaryResponseSchema,
            withSignal(signal),
          )
        ).data,
    },
    household: {
      get: (signal) => apiRequest('/api/household', HouseholdResponseSchema, withSignal(signal)),
      update: (input) =>
        apiRequest('/api/household', HouseholdResponseSchema, jsonBody('PUT', input)),
    },
    settings: {
      getDetection: (signal) =>
        apiRequest('/api/settings/detection', DetectionSettingsSchema, withSignal(signal)),
      updateDetection: (input) =>
        apiRequest('/api/settings/detection', DetectionSettingsSchema, jsonBody('PUT', input)),
      getAlertPreferences: (signal) =>
        apiRequest('/api/settings/alerts', AlertPreferencesSchema, withSignal(signal)),
      updateAlertPreferences: (input) =>
        apiRequest('/api/settings/alerts', AlertPreferencesSchema, jsonBody('PUT', input)),
    },
    sensors: {
      list: (signal) => apiRequest('/api/sensors', SensorListResponseSchema, withSignal(signal)),
      get: (sensorId, signal) =>
        apiRequest(`/api/sensors/${id(sensorId)}`, SensorResponseSchema, withSignal(signal)),
      create: (input) =>
        apiRequest('/api/sensors', SensorWithTokenResponseSchema, jsonBody('POST', input)),
      update: (sensorId, input) =>
        apiRequest(`/api/sensors/${id(sensorId)}`, SensorResponseSchema, jsonBody('PATCH', input)),
      rotateToken: (sensorId) =>
        apiRequest(
          `/api/sensors/${id(sensorId)}/rotate-token`,
          SensorWithTokenResponseSchema,
          jsonBody('POST'),
        ),
      remove: (sensorId) =>
        apiRequest(`/api/sensors/${id(sensorId)}`, SensorDeleteResponseSchema, {
          method: 'DELETE',
        }),
    },
    events: {
      list: (query, signal) =>
        apiRequest(
          `/api/events${toQueryString({ ...query })}`,
          EventsResponseSchema,
          withSignal(signal),
        ),
      daily: (days, signal) =>
        apiRequest(
          `/api/events/daily${toQueryString({ days })}`,
          DailySummaryResponseSchema,
          withSignal(signal),
        ),
    },
    timeline: {
      list: (query, signal) =>
        apiRequest(
          `/api/timeline${toQueryString({ ...query })}`,
          TimelineResponseSchema,
          withSignal(signal),
        ),
      summary: (filter, signal) =>
        apiRequest(
          `/api/timeline/summary${toQueryString({ ...filter })}`,
          TimelineSummaryResponseSchema,
          withSignal(signal),
        ),
      get: (timelineId, signal) =>
        apiRequest(
          `/api/timeline/${id(timelineId)}`,
          TimelineDetailResponseSchema,
          withSignal(signal),
        ),
    },
    alerts: {
      list: (filter, signal) =>
        apiRequest(`/api/alerts${alertQuery(filter)}`, AlertListResponseSchema, withSignal(signal)),
      get: (alertId, signal) =>
        apiRequest(`/api/alerts/${id(alertId)}`, AlertDetailResponseSchema, withSignal(signal)),
      acknowledge: (alertId) =>
        apiRequest(`/api/alerts/${id(alertId)}/acknowledge`, AlertResponseSchema, jsonBody('POST')),
      resolve: (alertId, input) =>
        apiRequest(
          `/api/alerts/${id(alertId)}/resolve`,
          AlertResponseSchema,
          jsonBody('POST', input),
        ),
      unreadCount: (signal) =>
        apiRequest('/api/alerts/unread-count', AlertUnreadCountResponseSchema, withSignal(signal)),
      markRead: (alertId) =>
        apiRequest(`/api/alerts/${id(alertId)}/read`, AlertResponseSchema, jsonBody('POST')),
      clips: (alertId, signal) =>
        apiRequest(
          `/api/alerts/${id(alertId)}/clips`,
          AlertClipsResponseSchema,
          withSignal(signal),
        ),
      markAllRead: () =>
        apiRequest('/api/alerts/read-all', AlertReadAllResponseSchema, jsonBody('POST')),
    },
    system: {
      sensorAdapters: (signal) =>
        apiRequest('/api/system/sensor-adapters', SensorAdaptersResponseSchema, withSignal(signal)),
      backupStatus: (signal) =>
        apiRequest('/api/system/backup', BackupStatusSchema, withSignal(signal)),
      features: (signal) =>
        apiRequest('/api/system/features', FeaturesResponseSchema, withSignal(signal)),
    },
    data: {
      summary: (signal) =>
        apiRequest('/api/data/summary', DataSummaryResponseSchema, withSignal(signal)),
      deleteSimulated: () =>
        apiRequest('/api/data/simulated', DeleteSimulatedResponseSchema, { method: 'DELETE' }),
    },
    simulator: {
      uploadClip: (alertId, video, durationMs) =>
        apiRequest(
          `/api/dev/simulator/alerts/${id(alertId)}/clips?durationMs=${Math.round(durationMs)}`,
          AlertClipUploadResponseSchema,
          {
            method: 'POST',
            // 매개변수(codecs 등)는 떼고 형식만 보낸다. 서버는 webm·mp4 만 받는다.
            headers: { 'Content-Type': video.type.split(';')[0] || 'video/webm' },
            body: video,
          },
        ),
      state: (signal) =>
        apiRequest('/api/dev/simulator/state', SimulatorStateSchema, withSignal(signal)),
      ensureSensors: (zone) =>
        apiRequest(
          '/api/dev/simulator/sensors',
          SimulatorStateSchema,
          jsonBody('POST', zone ? { zone } : {}),
        ),
      removeSensor: (zone) =>
        apiRequest(`/api/dev/simulator/sensors/${zone}`, SimulatorStateSchema, {
          method: 'DELETE',
        }),
      motion: (zone, options = {}) =>
        apiRequest(
          '/api/dev/simulator/motion',
          SimulatorStateSchema,
          jsonBody('POST', { zone, ...options }),
        ),
      setBattery: (zone, batteryPercent) =>
        apiRequest(
          '/api/dev/simulator/battery',
          SimulatorStateSchema,
          jsonBody('POST', { zone, batteryPercent }),
        ),
      setSilenced: (zone, silenced, fastForward) =>
        apiRequest(
          '/api/dev/simulator/silence',
          SimulatorStateSchema,
          jsonBody('POST', { zone, silenced, ...(fastForward ? { fastForward } : {}) }),
        ),
      setDeliveryFailure: (enabled) =>
        apiRequest(
          '/api/dev/simulator/faults',
          SimulatorStateSchema,
          jsonBody('POST', { deliveryFailure: enabled }),
        ),
      runScenario: (id, speed) =>
        apiRequest(
          `/api/dev/simulator/scenarios/${id}/run`,
          SimulatorStateSchema,
          jsonBody('POST', { speed }),
        ),
      stopScenario: () =>
        apiRequest('/api/dev/simulator/scenarios/stop', SimulatorStateSchema, jsonBody('POST')),
    },
    integrations: {
      list: (signal) =>
        apiRequest('/api/system/integrations', IntegrationsResponseSchema, withSignal(signal)),
    },
    notifications: {
      test: (channel) =>
        apiRequest(
          '/api/notifications/test',
          ChannelTestResponseSchema,
          jsonBody('POST', { channel }),
        ),
    },
    push: {
      config: (signal) =>
        apiRequest('/api/push/config', PushConfigResponseSchema, withSignal(signal)),
      list: (signal) =>
        apiRequest('/api/push/subscriptions', PushSubscriptionsResponseSchema, withSignal(signal)),
      subscribe: (input) =>
        apiRequest('/api/push/subscribe', PushSubscribeResponseSchema, jsonBody('POST', input)),
      remove: async (id) => {
        await apiRequest(
          `/api/push/subscriptions/${encodeURIComponent(id)}`,
          LogoutResponseSchema,
          {
            method: 'DELETE',
          },
        )
      },
    },
  }
  return client
}
