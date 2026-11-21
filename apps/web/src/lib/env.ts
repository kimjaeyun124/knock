/**
 * 브라우저에 공개되는 환경변수. VITE_ 접두사 변수만 읽는다.
 * 비밀값(키, 토큰 등)은 서버 전용이며 여기에 추가하면 안 된다.
 */
function readApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (raw === '') return ''
  if (!/^https?:\/\//.test(raw)) {
    throw new Error('VITE_API_BASE_URL은 비워 두거나 http(s):// 로 시작하는 주소여야 합니다.')
  }
  return raw
}

/**
 * 실행 모드.
 *  api  : 모든 기능이 실제 서버 데이터를 쓴다. (기본)
 *  demo : 서버가 아직 주지 못하는 화면을 테스트 데이터(Mock)로 채우고, 모든 화면에 데모 모드임을 표시한다. 개발 전용
 */
export type AppMode = 'api' | 'demo'

export function parseAppMode(raw: string | undefined): AppMode {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '' || value === 'api') return 'api'
  if (value === 'demo') return 'demo'
  throw new Error(`VITE_APP_MODE 는 api 또는 demo 여야 합니다. (현재 값: "${raw}")`)
}

export const env = {
  appMode: parseAppMode(import.meta.env.VITE_APP_MODE),
  /** 비어 있으면 같은 출처(/api)로 요청한다. */
  apiBaseUrl: readApiBaseUrl(),
  isDev: import.meta.env.DEV,
} as const
