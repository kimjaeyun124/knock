import { ApiError } from '@/services/apiClient'

/** 인증이 필요 없는(또는 401 이 "로그인 실패"를 뜻하는) 경로. 여기서 난 401 은 로그인 만료가 아니다. */
const AUTH_ENTRY_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/me']

/**
 * 로그인했던 사용자의 요청이 401 로 거절되었는가. (세션이 만료되었거나 서버에서 지워짐)
 * 로그인 시도 자체의 실패(잘못된 비밀번호)는 해당하지 않는다.
 */
export function isSessionExpired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status === 401 &&
    !AUTH_ENTRY_PATHS.some((path) => error.path === path)
  )
}

export const SESSION_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.'

export interface ApiErrorText {
  /** 무엇이 잘못됐는지 */
  message: string
  /** 사용자가 해 볼 수 있는 일. 없으면 null */
  hint: string | null
}

/**
 * 오류를 사용자에게 보여 줄 한국어로 정리하는 유일한 곳.
 * 서버가 보낸 문장이 있으면 그대로 쓰고(이미 한국어), 연결 문제는 원인별로 해 볼 일을 덧붙인다.
 * 내부 정보(스택·서버 경로)는 담지 않는다.
 */
export function describeApiError(error: unknown): ApiErrorText {
  if (isSessionExpired(error)) {
    return {
      message: SESSION_EXPIRED_MESSAGE,
      hint: '다시 로그인하면 하던 일을 이어서 할 수 있습니다.',
    }
  }
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'offline':
        return {
          message: error.message,
          hint: 'Wi-Fi나 모바일 데이터 연결을 확인해 주세요. 연결되면 자동으로 다시 불러옵니다.',
        }
      case 'network':
        return {
          message: error.message,
          hint: '서버가 실행 중인지, 주소가 맞는지 확인해 주세요. 서버를 켠 뒤 "다시 시도"를 눌러 주세요.',
        }
      case 'timeout':
        return {
          message: error.message,
          hint: '네트워크가 느리거나 서버가 바쁠 수 있습니다. 계속되면 서버 상태를 확인해 주세요.',
        }
      case 'invalid-response':
        return {
          message: error.message,
          hint: '웹 화면과 서버가 서로 다른 버전일 수 있습니다. 둘 다 최신으로 맞춘 뒤 새로고침해 주세요.',
        }
      default:
        return { message: error.message, hint: null }
    }
  }
  return {
    message: error instanceof Error ? error.message : '알 수 없는 문제가 발생했습니다.',
    hint: null,
  }
}
