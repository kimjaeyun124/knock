import { describe, expect, it } from 'vitest'
import { ApiError, type ApiErrorKind } from '@/services/apiClient'
import { SESSION_EXPIRED_MESSAGE, describeApiError, isSessionExpired } from './apiErrors'

const http = (status: number, path: string | null, message = '서버 메시지') =>
  new ApiError({ kind: 'http', status, message, ...(path ? { path } : {}) })
const of = (kind: ApiErrorKind) => new ApiError({ kind, message: `${kind} 오류` })

describe('isSessionExpired', () => {
  it('로그인한 사용자의 요청이 401 이면 세션 만료다', () => {
    expect(isSessionExpired(http(401, '/api/sensors'))).toBe(true)
    expect(isSessionExpired(http(401, '/api/settings/alerts'))).toBe(true)
  })

  it('로그인·가입·세션 확인 요청의 401 은 만료가 아니다', () => {
    for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/me']) {
      expect(isSessionExpired(http(401, path)), path).toBe(false)
    }
  })

  it('401 이 아니거나 HTTP 오류가 아니면 만료가 아니다', () => {
    expect(isSessionExpired(http(403, '/api/sensors'))).toBe(false)
    expect(isSessionExpired(http(500, '/api/sensors'))).toBe(false)
    expect(isSessionExpired(of('network'))).toBe(false)
    expect(isSessionExpired(new Error('x'))).toBe(false)
    expect(isSessionExpired(null)).toBe(false)
  })
})

describe('describeApiError — 연결 오류 5종을 쉬운 한국어로', () => {
  it('서버가 꺼져 있음: 서버 실행 여부를 확인하라고 안내', () => {
    const text = describeApiError(of('network'))
    expect(text.message).toBe('network 오류')
    expect(text.hint).toContain('서버가 실행 중인지')
  })

  it('응답 시간 초과: 느리거나 바쁠 수 있다고 안내', () => {
    expect(describeApiError(of('timeout')).hint).toContain('느리거나 서버가 바쁠 수')
  })

  it('잘못된 응답: 웹과 서버 버전이 다를 수 있다고 안내', () => {
    expect(describeApiError(of('invalid-response')).hint).toContain('서로 다른 버전')
  })

  it('인증 만료: 다시 로그인하라고 안내하고 서버 문구 대신 고정된 문구를 쓴다', () => {
    const text = describeApiError(http(401, '/api/sensors', '로그인이 필요합니다.'))
    expect(text.message).toBe(SESSION_EXPIRED_MESSAGE)
    expect(text.hint).toContain('다시 로그인')
  })

  it('네트워크 끊김(오프라인): 인터넷 연결을 확인하라고 안내', () => {
    expect(describeApiError(of('offline')).hint).toContain('Wi-Fi')
  })

  it('서버가 보낸 한국어 메시지는 그대로 쓰고, 알 수 없는 오류도 내부 정보 없이 알린다', () => {
    expect(describeApiError(http(409, '/api/sensors', '이미 등록된 장치 번호입니다.'))).toEqual({
      message: '이미 등록된 장치 번호입니다.',
      hint: null,
    })
    expect(describeApiError('이상한 값').message).toBe('알 수 없는 문제가 발생했습니다.')
  })
})
