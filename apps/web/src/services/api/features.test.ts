import { describe, expect, it, vi } from 'vitest'
import { parseAppMode } from '@/lib/env'
import { composeApiClient, isMockable, parseMockFeatures } from './features'
import { createHttpApiClient } from './http'
import { createMockApiClient } from './mock'
import { loadApiRuntime } from './runtime'

describe('parseMockFeatures', () => {
  it('비어 있으면 Mock 을 쓰지 않는다', () => {
    expect(parseMockFeatures(undefined)).toEqual([])
    expect(parseMockFeatures('')).toEqual([])
    expect(parseMockFeatures(' , ')).toEqual([])
  })

  it('쉼표로 구분한 기능을 공백·중복 없이 읽는다', () => {
    expect(parseMockFeatures(' integrations , events,integrations')).toEqual([
      'integrations',
      'events',
    ])
  })

  it('알 수 없는 이름은 조용히 무시하지 않고 오류로 알린다', () => {
    expect(() => parseMockFeatures('integration')).toThrow(/알 수 없는 기능 "integration"/)
  })

  it.each(['health', 'auth'])('%s 은(는) Mock 으로 바꿀 수 없다', (name) => {
    expect(() => parseMockFeatures(name)).toThrow(/Mock으로 바꿀 수 없습니다/)
  })
})

describe('composeApiClient', () => {
  it('고른 기능만 Mock 으로 바꾸고 나머지는 실제 구현을 그대로 둔다', () => {
    const real = createHttpApiClient()
    const mock = createMockApiClient()
    const composed = composeApiClient(real, mock, ['integrations'])
    expect(composed.integrations).toBe(mock.integrations)
    expect(composed.sensors).toBe(real.sensors)
    expect(composed.alerts).toBe(real.alerts)
    expect(composed.auth).toBe(real.auth)
  })

  it('Mock 구현이 없는 기능을 고르면 오류로 알린다', () => {
    expect(() =>
      composeApiClient(createHttpApiClient(), createMockApiClient(), ['alerts']),
    ).toThrow(/"alerts" 기능에는 Mock 구현이 없습니다/)
  })
})

describe('loadApiRuntime', () => {
  it('Mock 을 고르지 않으면 모두 실제 서버이고 Mock 코드를 불러오지 않는다', async () => {
    const loadMock = vi.fn(() => Promise.resolve({ createMockApiClient }))
    const runtime = await loadApiRuntime('', loadMock)
    expect(runtime.mockFeatures).toEqual([])
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('개발 중에는 고른 기능만 Mock 으로 바뀌고 그 목록이 함께 전달된다', async () => {
    const runtime = await loadApiRuntime('integrations', () =>
      Promise.resolve({ createMockApiClient }),
    )
    expect(runtime.mockFeatures).toEqual(['integrations'])
  })

  it('운영 빌드(Mock 로더 없음)에서 Mock 을 고르면 시작하지 않는다', async () => {
    await expect(loadApiRuntime('integrations', null)).rejects.toThrow(
      /운영 빌드에서는 Mock을 쓸 수 없습니다/,
    )
  })

  it('운영 빌드에서도 Mock 을 고르지 않으면 정상 동작한다', async () => {
    const runtime = await loadApiRuntime(undefined, null)
    expect(runtime.mockFeatures).toEqual([])
  })
})

describe('실행 모드 (API / Demo)', () => {
  const loadMock = () => Promise.resolve({ createMockApiClient })

  it('VITE_APP_MODE: 비어 있으면 api, demo 는 demo, 그 밖의 값은 오류', () => {
    expect(parseAppMode(undefined)).toBe('api')
    expect(parseAppMode('')).toBe('api')
    expect(parseAppMode(' API ')).toBe('api')
    expect(parseAppMode('demo')).toBe('demo')
    expect(() => parseAppMode('production')).toThrow(/api 또는 demo/)
  })

  it('api 모드: Mock 을 고르지 않으면 모두 실제 서버이고 Mock 코드를 불러오지도 않는다', async () => {
    const spy = vi.fn(loadMock)
    const runtime = await loadApiRuntime('', spy, 'api')
    expect(runtime).toMatchObject({ mode: 'api', mockFeatures: [] })
    expect(spy).not.toHaveBeenCalled()
  })

  it('demo 모드: Mock 구현이 있는 기능을 모두 Mock 으로 바꾸되, 서버 상태·로그인은 실제 서버로 남긴다', async () => {
    const runtime = await loadApiRuntime('', loadMock, 'demo')
    expect(runtime.mode).toBe('demo')
    expect(runtime.mockFeatures.length).toBeGreaterThan(0)
    expect(runtime.mockFeatures.every((feature) => isMockable(feature))).toBe(true)
    expect(runtime.mockFeatures).toEqual(expect.arrayContaining(['dashboard', 'sensors']))
    const real = createHttpApiClient()
    expect(runtime.client.auth.login.name).toBe(real.auth.login.name)
    expect(runtime.client.health).toBe(runtime.client.health)
  })

  it('demo 모드에서 VITE_MOCK_FEATURES 를 주면 그 범위로 좁힌다', async () => {
    const runtime = await loadApiRuntime('sensors', loadMock, 'demo')
    expect(runtime.mockFeatures).toEqual(['sensors'])
  })

  it('운영 빌드(Mock 을 불러올 수 없음)에서는 데모 모드가 시작되지 않는다', async () => {
    await expect(loadApiRuntime('', null, 'demo')).rejects.toThrow(/운영 빌드에서는 데모 모드/)
    await expect(loadApiRuntime('sensors', null, 'api')).rejects.toThrow(/운영 빌드에서는 Mock/)
  })
})
