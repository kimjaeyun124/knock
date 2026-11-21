import type { ApiClient } from './types'

export const API_FEATURES = [
  'health',
  'auth',
  'household',
  'settings',
  'sensors',
  'events',
  'alerts',
  'dashboard',
  'timeline',
  'integrations',
  'notifications',
  'push',
  'system',
  'data',
  'simulator',
] as const
export type ApiFeature = (typeof API_FEATURES)[number]

/**
 * Mock으로 바꿀 수 없는 기능.
 * 서버 상태와 로그인은 가짜로 만들면 실제 서버 문제를 가리게 된다.
 */
const NOT_MOCKABLE: readonly ApiFeature[] = ['health', 'auth']

/** Mock 으로 바꿀 수 있는 기능인가 (서버 상태·로그인은 제외) */
export function isMockable(feature: string): feature is ApiFeature {
  return isApiFeature(feature) && !NOT_MOCKABLE.includes(feature)
}

function isApiFeature(value: string): value is ApiFeature {
  return (API_FEATURES as readonly string[]).includes(value)
}

/**
 * VITE_MOCK_FEATURES 값(쉼표 구분)을 기능 목록으로 바꾼다.
 * 오타나 알 수 없는 이름은 조용히 무시하지 않고 오류로 알린다.
 */
export function parseMockFeatures(raw: string | undefined): ApiFeature[] {
  const names = (raw ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const features: ApiFeature[] = []
  for (const name of names) {
    if (!isApiFeature(name)) {
      throw new Error(
        `VITE_MOCK_FEATURES에 알 수 없는 기능 "${name}"이(가) 있습니다. 사용할 수 있는 값: ${API_FEATURES.join(', ')}`,
      )
    }
    if (NOT_MOCKABLE.includes(name)) {
      throw new Error(
        `"${name}"은(는) Mock으로 바꿀 수 없습니다. 실제 서버 상태를 가리게 되기 때문입니다.`,
      )
    }
    if (!features.includes(name)) features.push(name)
  }
  return features
}

function replaceFeature<K extends ApiFeature>(
  target: ApiClient,
  key: K,
  source: Partial<ApiClient>,
): void {
  const implementation = source[key]
  if (!implementation) {
    throw new Error(`"${key}" 기능에는 Mock 구현이 없습니다. VITE_MOCK_FEATURES에서 빼 주세요.`)
  }
  target[key] = implementation
}

/** 실제 구현 위에 고른 기능만 Mock 구현으로 바꾼다. 나머지는 실제 서버 그대로다. */
export function composeApiClient(
  real: ApiClient,
  mock: Partial<ApiClient>,
  mockFeatures: readonly ApiFeature[],
): ApiClient {
  const composed: ApiClient = { ...real }
  for (const feature of mockFeatures) replaceFeature(composed, feature, mock)
  return composed
}
