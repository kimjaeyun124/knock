// 개발 전용 Mock 구현. 운영 빌드에는 포함되지 않는다. (runtime.ts, scripts/check-client-bundle.mjs)
//
// 서버가 아직 제공하지 않는 기능, 또는 실제 서버로는 만들기 어려운 상태(예: 가짜 응답 채널)를
// 화면에서 미리 보고 싶을 때만 쓴다. 서버에 기능이 있으면 화면은 실제 서버를 쓴다.
import {
  MAX_SENSORS_PER_HOUSEHOLD,
  type DashboardSummary,
  type MovementEvent,
  type Sensor,
} from '@tetris/shared'
import { ApiError } from '../apiClient'
import { createMockTimelineApi } from './mockTimeline'
import type { ApiClient, Mocked, SensorsApi } from './types'

/** 운영 번들에 이 문자열이 있으면 빌드 검사가 실패한다. */
export const MOCK_ADAPTER_SENTINEL = '__TETRIS_MOCK_ADAPTER__'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/**
 * 대시보드를 서버 없이 미리 볼 때 쓰는 개발용 예시 데이터. 실제 센서·움직임이 아니다.
 * 응답 형태는 실제와 같은 DashboardSummary 이고, 이름에 "(샘플)"을 붙이고 출처는 시뮬레이션으로 둬서
 * 화면 어디에서도 실제 장치의 값처럼 보이지 않는다. 이동 경로 센서는 "연결은 정상인데 배터리 부족"인 경우를 보여 준다.
 */
export function createMockDashboardSummary(now: Date): Mocked<DashboardSummary> {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const sensor = (
    id: string,
    name: string,
    zone: Sensor['zone'],
    lastSeenMs: number,
    batteryPercent: number,
    batteryLevel: Sensor['batteryLevel'],
  ): Sensor => ({
    id: `mock-${id}`,
    name: `(샘플) ${name}`,
    kind: 'MOTION',
    zone,
    origin: 'SIMULATED',
    isActive: true,
    state: 'ONLINE',
    lastSeenAt: ago(lastSeenMs),
    batteryPercent,
    batteryLevel,
    firmwareVersion: null,
    deviceId: null,
    lastHeartbeatAt: ago(lastSeenMs),
    offlineAfterSeconds: null,
    effectiveOfflineAfterSeconds: 300,
    silentSeconds: Math.floor(lastSeenMs / 1000),
    longSilent: false,
    receiveErrors: { count: 0, lastAt: null, lastReason: null },
    sensitivity: null,
    hardwareSensitivitySupported: false,
    createdAt: ago(9 * DAY),
  })
  const event = (index: number, zone: MovementEvent['zone'], sensorName: string, ms: number) => ({
    id: `mock-event-${index}`,
    sensorId: `mock-${zone.toLowerCase()}`,
    sensorName: `(샘플) ${sensorName}`,
    zone,
    origin: 'SIMULATED' as const,
    occurredAt: ago(ms),
    receivedAt: ago(ms - 1000),
    isLate: false,
  })
  const kstDate = (daysBack: number) =>
    new Date(now.getTime() - daysBack * DAY + 9 * 60 * MINUTE).toISOString().slice(0, 10)
  const movements = [4, 7, 2, 0, 9, 5, 6]

  return {
    mock: true,
    mockSource: MOCK_ADAPTER_SENTINEL,
    generatedAt: now.toISOString(),
    schedule: {
      monitoringEnabled: true,
      activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
      nightStart: '22:00',
      nightEnd: '06:00',
    },
    monitoringStartedAt: ago(9 * DAY),
    lastDataAt: ago(2 * MINUTE),
    sensors: [
      sensor('bed_side', '침대 주변 센서', 'BED_SIDE', 2 * MINUTE, 82, 'OK'),
      sensor('path', '이동 경로 센서', 'PATH', 5 * MINUTE, 14, 'LOW'),
      sensor('entrance', '현관 센서', 'ENTRANCE', 3 * MINUTE, 64, 'OK'),
    ],
    activeAlerts: [],
    recentEvents: [
      event(1, 'PATH', '이동 경로 센서', 12 * MINUTE),
      event(2, 'BED_SIDE', '침대 주변 센서', 47 * MINUTE),
      event(3, 'BED_SIDE', '침대 주변 센서', 3 * 60 * MINUTE),
      event(4, 'ENTRANCE', '현관 센서', 5 * 60 * MINUTE),
      event(5, 'PATH', '이동 경로 센서', 9 * 60 * MINUTE),
    ],
    weekly: movements.map((count, index) => ({
      date: kstDate(6 - index),
      movements: count,
      simulatedMovements: count,
      attentionAlerts: index === 4 ? 1 : 0,
    })),
  }
}

function mockSeedSensors(now: Date): Sensor[] {
  return createMockDashboardSummary(now).sensors.map(({ ...sensor }) => sensor)
}

const mocked = <T extends object>(body: T): Mocked<T> => ({
  ...body,
  mock: true,
  mockSource: MOCK_ADAPTER_SENTINEL,
})

const notFound = () =>
  new ApiError({
    kind: 'http',
    status: 404,
    code: 'NOT_FOUND',
    message: '센서를 찾을 수 없습니다.',
  })

/**
 * 센서 API 를 서버 없이 써 볼 수 있는 메모리 속 구현. 새로고침하면 처음 상태로 돌아간다.
 * 서버와 같은 규칙(최대 개수, "사용 안 함"이어야 삭제)을 따르고, 만든 센서는 모두 시뮬레이션으로 표시한다.
 * 장치 토큰도 가짜이며 어떤 서버에도 통하지 않는다.
 */
export function createMockSensorsApi(now: () => Date = () => new Date()): SensorsApi {
  let sensors = mockSeedSensors(now())
  let serial = 0
  const find = (id: string) => sensors.find((sensor) => sensor.id === id)
  const replace = (next: Sensor) => {
    sensors = sensors.map((sensor) => (sensor.id === next.id ? next : sensor))
    return next
  }
  const token = () => `mock_not_a_real_token_${++serial}`

  return {
    list: () => Promise.resolve(mocked({ sensors: [...sensors] })),
    get: (id) => {
      const sensor = find(id)
      return sensor ? Promise.resolve(mocked({ sensor })) : Promise.reject(notFound())
    },
    create: (input) => {
      if (sensors.length >= MAX_SENSORS_PER_HOUSEHOLD) {
        return Promise.reject(
          new ApiError({
            kind: 'http',
            status: 409,
            code: 'CONFLICT',
            message: `센서는 최대 ${MAX_SENSORS_PER_HOUSEHOLD}개까지 등록할 수 있습니다.`,
          }),
        )
      }
      const sensor: Sensor = {
        id: `mock-new-${++serial}`,
        name: input.name,
        kind: 'MOTION',
        zone: input.zone,
        origin: 'SIMULATED',
        isActive: true,
        state: 'PENDING',
        lastSeenAt: null,
        batteryPercent: null,
        batteryLevel: 'UNKNOWN',
        firmwareVersion: null,
        deviceId: null,
        lastHeartbeatAt: null,
        offlineAfterSeconds: null,
        effectiveOfflineAfterSeconds: 300,
        silentSeconds: null,
        longSilent: false,
        receiveErrors: { count: 0, lastAt: null, lastReason: null },
        sensitivity: null,
        hardwareSensitivitySupported: false,
        createdAt: now().toISOString(),
      }
      sensors = [...sensors, sensor]
      return Promise.resolve(mocked({ sensor, deviceToken: token() }))
    },
    update: (id, input) => {
      const sensor = find(id)
      if (!sensor) return Promise.reject(notFound())
      return Promise.resolve(
        mocked({
          sensor: replace({
            ...sensor,
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.zone !== undefined ? { zone: input.zone } : {}),
            ...(input.isActive !== undefined
              ? {
                  isActive: input.isActive,
                  state: input.isActive ? (sensor.lastSeenAt ? 'ONLINE' : 'PENDING') : 'DISABLED',
                }
              : {}),
          }),
        }),
      )
    },
    rotateToken: (id) => {
      const sensor = find(id)
      return sensor
        ? Promise.resolve(mocked({ sensor, deviceToken: token() }))
        : Promise.reject(notFound())
    },
    remove: (id) => {
      const sensor = find(id)
      if (!sensor) return Promise.reject(notFound())
      if (sensor.isActive) {
        return Promise.reject(
          new ApiError({
            kind: 'http',
            status: 409,
            code: 'CONFLICT',
            message: '센서를 삭제하려면 먼저 "사용 안 함"으로 바꿔 주세요.',
          }),
        )
      }
      sensors = sensors.filter((item) => item.id !== id)
      return Promise.resolve(mocked({ ok: true as const, deletedEvents: 0 }))
    },
  }
}

/** 화면에서 세 가지 연동 방식이 어떻게 보이는지 확인하기 위한 가상의 연동 상태. 실제 상태가 아니다. */
export function createMockApiClient(now: () => Date = () => new Date()): Partial<ApiClient> {
  return {
    sensors: createMockSensorsApi(now),
    timeline: createMockTimelineApi(now),
    dashboard: {
      summary: () => Promise.resolve(createMockDashboardSummary(now())),
    },
    integrations: {
      list: () => {
        const lastSuccessAt = now().toISOString()
        const response: Mocked<Awaited<ReturnType<ApiClient['integrations']['list']>>> = {
          mock: true,
          mockSource: MOCK_ADAPTER_SENTINEL,
          integrations: [
            { key: 'IN_APP', mode: 'REAL', lastSuccessAt },
            { key: 'WEB_PUSH', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
            { key: 'WATCH', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
            { key: 'SMS', mode: 'MOCK', lastSuccessAt },
            { key: 'KAKAO', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
          ],
        }
        return Promise.resolve(response)
      },
    },
  }
}
