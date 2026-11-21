import { HealthResponseSchema, type HealthResponse } from '@tetris/shared'
import { apiRequest } from './apiClient'

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest('/api/health', HealthResponseSchema, signal ? { signal } : {})
}
