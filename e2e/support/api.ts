import { expect, type APIRequestContext } from '@playwright/test'

const DEFAULT_SETTINGS = {
  // 지금 몇 시에 실행해도 움직임 알림이 만들어지도록 야간 시간대를 하루 종일로 둔다.
  nightStart: '00:00',
  nightEnd: '23:59',
  sensitivity: 'MEDIUM',
  sequenceWindowMinutes: 10,
  cooldownMinutes: 10,
  reminderMinutes: 5,
  offlineAfterSeconds: 300,
  lowBatteryPercent: 20,
  criticalBatteryPercent: 10,
  retentionDays: 90,
} as const

export type SettingsPatch = Partial<Record<keyof typeof DEFAULT_SETTINGS, string | number>>

/** 테스트마다 같은 출발점에서 시작하도록 시뮬레이션 데이터·장애 주입·감지 설정을 되돌린다. */
/** 시뮬레이션 데이터만 지운다. (감지 설정은 그대로 둔다) */
export async function clearSimulated(api: APIRequestContext): Promise<void> {
  const deleted = await api.delete('/api/data/simulated')
  expect(deleted.ok()).toBe(true)
}

export async function resetState(api: APIRequestContext): Promise<void> {
  await api.post('/api/dev/simulator/scenarios/stop')
  await api.post('/api/dev/simulator/faults', { data: { deliveryFailure: false } })
  await clearSimulated(api)
  await setSettings(api, {})
}

export async function setSettings(api: APIRequestContext, patch: SettingsPatch): Promise<void> {
  const response = await api.put('/api/settings/detection', {
    data: { ...DEFAULT_SETTINGS, ...patch },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

export async function ensureSimulatedSensors(api: APIRequestContext): Promise<void> {
  const response = await api.post('/api/dev/simulator/sensors')
  expect(response.ok(), await response.text()).toBe(true)
}

export async function sendMotion(
  api: APIRequestContext,
  zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE',
): Promise<void> {
  const response = await api.post('/api/dev/simulator/motion', { data: { zone } })
  expect(response.ok(), await response.text()).toBe(true)
}

/** 시나리오를 재생하고 끝날 때까지 기다린다. */
export async function playScenario(
  api: APIRequestContext,
  id: string,
  speed: 1 | 10 | 60 = 60,
): Promise<void> {
  const started = await api.post(`/api/dev/simulator/scenarios/${id}/run`, { data: { speed } })
  expect(started.ok(), await started.text()).toBe(true)
  await expect
    .poll(
      async () => {
        const state = (await (await api.get('/api/dev/simulator/state')).json()) as {
          running: unknown
        }
        return state.running
      },
      { timeout: 30_000, message: '시나리오 재생이 끝나지 않았습니다.' },
    )
    .toBeNull()
}
