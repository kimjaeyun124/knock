import {
  AuthSessionResponseSchema,
  LogoutResponseSchema,
  type AuthSessionResponse,
  type LoginRequest,
} from '@tetris/shared'
import { ApiError, apiRequest } from './apiClient'

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

/**
 * 현재 로그인 상태. 로그인되어 있지 않으면(401) null 이다.
 * 서버에 닿지 못하는 경우 등 그 밖의 실패는 null 이 아니라 오류로 던진다.
 * ("로그아웃된 상태"와 "확인하지 못한 상태"를 섞지 않기 위해서다.)
 */
export async function fetchSession(signal?: AbortSignal): Promise<AuthSessionResponse | null> {
  try {
    return await apiRequest('/api/auth/me', AuthSessionResponseSchema, signal ? { signal } : {})
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status === 401) return null
    throw error
  }
}

export function login(input: LoginRequest): Promise<AuthSessionResponse> {
  return apiRequest('/api/auth/login', AuthSessionResponseSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
}

export async function logout(): Promise<void> {
  await apiRequest('/api/auth/logout', LogoutResponseSchema, { method: 'POST' })
}
