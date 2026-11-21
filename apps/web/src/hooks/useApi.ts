import { useContext } from 'react'
import type { ApiFeature } from '@/services/api/features'
import type { ApiClient } from '@/services/api/types'
import { ApiContext } from './apiContext'

function useRuntime() {
  const runtime = useContext(ApiContext)
  if (!runtime) throw new Error('ApiProvider 안에서만 사용할 수 있습니다.')
  return runtime
}

/** 화면이 서버와 통신하는 유일한 통로. 실제 서버인지 Mock인지는 기능별로 정해져 있다. */
export function useApi(): ApiClient {
  return useRuntime().client
}

/** 실행 모드. demo 이면 일부 화면이 테스트 데이터다. */
export function useAppMode(): 'api' | 'demo' {
  return useRuntime().mode
}

/** Mock 구현으로 바꾼 기능 목록. 비어 있으면 모두 실제 서버다. */
export function useMockFeatures(): readonly ApiFeature[] {
  return useRuntime().mockFeatures
}

/** 이 기능이 Mock(샘플 데이터)으로 동작 중인가 */
export function useIsMocked(feature: ApiFeature): boolean {
  return useRuntime().mockFeatures.includes(feature)
}
