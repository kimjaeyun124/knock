import type { Alert, AlertClip, AlertDetail, MobileLogin, Sensor, UnreadCount } from './types'

/** 서버가 보낸 오류를 사람이 읽을 문장과 함께 담는다. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const TIMEOUT_MS = 15_000

async function request<T>(
  baseUrl: string,
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? '서버가 정해진 시간 안에 응답하지 않았습니다.'
        : '서버에 연결할 수 없습니다. 서버 주소와 네트워크를 확인해 주세요.',
      null,
    )
  } finally {
    clearTimeout(timer)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  if (!res.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
        ? (body as { error: { message: string } }).error.message
        : `요청을 처리하지 못했습니다. (상태 코드 ${res.status})`
    throw new ApiError(message, res.status)
  }
  return body as T
}

/** 서버 API. 앱은 쿠키 대신 Bearer 토큰으로 인증한다. (서버의 /api/auth/mobile/login) */
export function createApi(baseUrl: string, token: string | null) {
  const get = <T>(path: string) => request<T>(baseUrl, path, { token })
  const post = <T>(path: string, body: unknown = {}) =>
    request<T>(baseUrl, path, { method: 'POST', token, body })
  return {
    login: (email: string, password: string) =>
      request<MobileLogin>(baseUrl, '/api/auth/mobile/login', {
        method: 'POST',
        body: { email, password },
      }),
    logout: () => post<{ ok: true }>('/api/auth/logout'),
    alerts: () => get<{ alerts: Alert[] }>('/api/alerts?limit=50'),
    unreadCount: () => get<UnreadCount>('/api/alerts/unread-count'),
    alert: (id: string) => get<AlertDetail>(`/api/alerts/${encodeURIComponent(id)}`),
    clips: (id: string) =>
      get<{ clips: AlertClip[] }>(`/api/alerts/${encodeURIComponent(id)}/clips`),
    markRead: (id: string) => post(`/api/alerts/${encodeURIComponent(id)}/read`),
    acknowledge: (id: string) => post(`/api/alerts/${encodeURIComponent(id)}/acknowledge`),
    resolve: (id: string) =>
      post(`/api/alerts/${encodeURIComponent(id)}/resolve`, { resolution: 'CHECKED' }),
    sensors: () => get<{ sensors: Sensor[] }>('/api/sensors'),
    /** 영상 재생 주소와 헤더 (영상도 같은 토큰으로 인증한다) */
    clipSource: (clip: AlertClip): { uri: string; headers: Record<string, string> } => ({
      uri: `${baseUrl}${clip.url}`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  }
}

export type Api = ReturnType<typeof createApi>
