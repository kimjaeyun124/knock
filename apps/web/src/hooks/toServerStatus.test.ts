import { describe, expect, it } from 'vitest'
import type { HealthResponse } from '@tetris/shared'
import { ApiError } from '@/services/apiClient'
import { HEALTH_BODY } from '@/test/helpers'
import { toServerStatus } from './useServerStatus'

const health = HEALTH_BODY as HealthResponse

describe('toServerStatus', () => {
  it('이전에 성공한 데이터가 남아 있어도 최근 확인이 실패했으면 error다', () => {
    const status = toServerStatus({
      isError: true,
      isPending: false,
      error: new Error('서버에 연결할 수 없습니다.'),
      data: health, // 오래된 성공 응답
    })
    expect(status).toEqual({
      state: 'error',
      message: '서버에 연결할 수 없습니다.',
      unreachable: false,
    })
  })

  it('네트워크 오류는 서버에 닿지 못한 것(unreachable)으로 구분한다', () => {
    const status = toServerStatus({
      isError: true,
      isPending: false,
      error: new ApiError({ kind: 'network', message: '서버에 연결할 수 없습니다.' }),
      data: undefined,
    })
    expect(status).toMatchObject({ state: 'error', unreachable: true })
  })

  it('데이터가 있고 오류가 없으면 ok다', () => {
    const status = toServerStatus({ isError: false, isPending: false, error: null, data: health })
    expect(status.state).toBe('ok')
  })

  it('아직 응답이 없으면 checking이다', () => {
    const status = toServerStatus({ isError: false, isPending: true, error: null, data: undefined })
    expect(status.state).toBe('checking')
  })
})
