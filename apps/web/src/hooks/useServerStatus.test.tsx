import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HEALTH_BODY, jsonResponse, QueryWrapper, stubFetch } from '@/test/helpers'
import { useServerStatus } from './useServerStatus'

describe('useServerStatus', () => {
  it('처음에는 확인 중이고, 응답이 오면 ok가 된다', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(HEALTH_BODY)))
    const { result } = renderHook(() => useServerStatus(), { wrapper: QueryWrapper })
    expect(result.current.state).toBe('checking')
    await waitFor(() => expect(result.current.state).toBe('ok'))
  })

  it('서버 오류는 ok로 표시되지 않고 error가 된다', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 500 })))
    const { result } = renderHook(() => useServerStatus(), { wrapper: QueryWrapper })
    await waitFor(() => expect(result.current.state).toBe('error'))
  })
})
