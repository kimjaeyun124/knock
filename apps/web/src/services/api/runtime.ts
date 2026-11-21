import type { AppMode } from '@/lib/env'
import { composeApiClient, isMockable, parseMockFeatures, type ApiFeature } from './features'
import { createHttpApiClient } from './http'
import type { ApiClient } from './types'

export interface ApiRuntime {
  /** api: 실제 서버, demo: 테스트 데이터(개발 전용). Mock 을 일부만 쓰는 api 모드도 있다. */
  mode: AppMode
  client: ApiClient
  /** Mock 구현으로 바꾼 기능. 비어 있으면 모두 실제 서버다. */
  mockFeatures: readonly ApiFeature[]
}

/** Mock 구현을 불러오는 함수. 운영 빌드에서는 null 이어서 Mock 코드가 번들에 들어가지 않는다. */
export type MockLoader = () => Promise<{ createMockApiClient: () => Partial<ApiClient> }>

/**
 * 화면이 쓸 API 클라이언트를 만든다.
 *
 * - api 모드(기본): VITE_MOCK_FEATURES 가 비어 있으면 전부 실제 서버를 호출한다.
 *   (개발 중 서버에 없는 기능만 골라 Mock 으로 바꿀 수는 있다.)
 * - demo 모드: Mock 구현이 있는 기능을 모두 Mock 으로 바꾼다. (VITE_MOCK_FEATURES 로 범위를 좁힐 수 있다.)
 *   로그인·서버 상태는 항상 실제 서버다. 운영 빌드에서는 쓸 수 없다.
 */
export async function loadApiRuntime(
  rawMockFeatures: string | undefined,
  loadMock: MockLoader | null,
  mode: AppMode = 'api',
): Promise<ApiRuntime> {
  const real = createHttpApiClient()
  const requested = parseMockFeatures(rawMockFeatures)
  if (mode === 'api' && requested.length === 0) return { mode, client: real, mockFeatures: [] }

  if (!loadMock) {
    throw new Error(
      mode === 'demo'
        ? '운영 빌드에서는 데모 모드를 쓸 수 없습니다. VITE_APP_MODE 를 비우고 다시 빌드해 주세요.'
        : '운영 빌드에서는 Mock을 쓸 수 없습니다. VITE_MOCK_FEATURES를 비우고 다시 빌드해 주세요.',
    )
  }
  const { createMockApiClient } = await loadMock()
  const mock = createMockApiClient()
  const mockFeatures =
    mode === 'demo' && requested.length === 0
      ? (Object.keys(mock) as ApiFeature[]).filter(isMockable)
      : requested
  return { mode, client: composeApiClient(real, mock, mockFeatures), mockFeatures }
}
