export const SESSION_COOKIE_NAME = 'tetris_session'

/** 로그인 유지 기간. 만료 후에는 다시 로그인해야 한다. (연장 없는 고정 기간) */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000

/** 같은 출처(IP + 이메일)에서 연속 실패를 허용하는 횟수와 제한 시간 */
export const LOGIN_MAX_FAILURES = 5
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000
