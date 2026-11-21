import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider } from '@/app/ApiProvider'
import { createTestQueryClient, testRuntime } from '@/test/helpers'
import { fakeSocket } from '@/test/fakeSocket'
import { useRealtimeSync } from './useRealtimeSync'

function setup() {
  const queryClient = createTestQueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider runtime={testRuntime()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiProvider>
  )
  const view = renderHook(() => useRealtimeSync(), { wrapper })
  const keys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey)
  return { ...view, invalidate, keys }
}

afterEach(() => fakeSocket.reset())

describe('useRealtimeSync', () => {
  it.each([
    ['alert.created', ['alerts']],
    ['alert.updated', ['alerts']],
    ['delivery.updated', ['alerts']],
    ['event.created', ['events']],
    ['sensor.status', ['sensors']],
    ['settings.updated', ['settings', 'detection']],
  ])('%s 를 받으면 해당 데이터를 다시 가져온다', (event, key) => {
    const { keys } = setup()
    fakeSocket.emit(event, {})
    // 대시보드는 어느 변화에나 함께 다시 읽는다
    expect(keys()).toEqual([key, ['dashboard'], ['timeline']])
  })

  it('monitoring.status 를 받으면 센서·설정과 대시보드·기록을 다시 가져온다', () => {
    const { keys } = setup()
    fakeSocket.emit('monitoring.status', {})
    expect(keys()).toEqual([['sensors'], ['settings', 'detection'], ['dashboard'], ['timeline']])
  })

  it('연결될 때마다 알림·기록·센서·설정을 모두 다시 가져와 놓친 변화를 보충한다', () => {
    const { keys } = setup()
    fakeSocket.emit('connect')
    expect(keys()).toEqual([
      ['health'],
      ['alerts'],
      ['events'],
      ['sensors'],
      ['settings', 'detection'],
      ['dashboard'],
      ['timeline'],
    ])
    fakeSocket.emit('connect') // 재연결
    expect(keys()).toHaveLength(14)
  })

  it('연결이 끊기면 서버 상태·센서·알림을 바로 다시 확인한다 (오래된 값이 현재처럼 남지 않게)', () => {
    const { keys } = setup()
    fakeSocket.emit('disconnect')
    expect(keys()).toEqual([['health'], ['sensors'], ['alerts'], ['dashboard'], ['timeline']])
  })

  it('로그인 정보는 실시간 이벤트로 건드리지 않는다', () => {
    const { keys } = setup()
    fakeSocket.emit('connect')
    for (const key of keys()) expect(key?.[0]).not.toBe('auth')
  })

  it('화면이 사라지면 구독을 해제한다', () => {
    const { unmount, keys } = setup()
    expect(fakeSocket.listenerCount('alert.created')).toBe(1)
    unmount()
    expect(fakeSocket.listenerCount('alert.created')).toBe(0)
    fakeSocket.emit('alert.created', {})
    expect(keys()).toEqual([])
  })
})
