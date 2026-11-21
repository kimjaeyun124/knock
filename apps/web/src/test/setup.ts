import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { fakeSocketStatus } from './fakeSocket'

// 컴퓨터가 바쁠 때 비동기 대기(findBy, waitFor)가 기본 1초에 걸려 흔들리지 않게 한다.
configure({ asyncUtilTimeout: 5000 })

// 테스트에서는 실제 Socket.IO 연결을 만들지 않는다. (대역은 test/fakeSocket.ts)
vi.mock('@/lib/socket', async () => {
  const { fakeSocket, fakeSocketStatus } = await import('./fakeSocket')
  return {
    socket: fakeSocket,
    connectSocket: vi.fn(),
    disconnectSocket: vi.fn(),
    getSocketStatus: fakeSocketStatus.get,
    getSocketInfo: fakeSocketStatus.getInfo,
    subscribeSocketStatus: fakeSocketStatus.subscribe,
  }
})

// jsdom 에는 <dialog> 의 모달 기능과 ResizeObserver 가 없다. 실제 브라우저와 같은 약속(open 속성, close 이벤트)만 흉내 낸다.
// (`@vitest-environment node` 테스트에서는 브라우저 객체가 없으므로 건너뛴다)
if (typeof window !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub
  // Radix(토스트·슬라이더)가 포인터 캡처를 확인한다. jsdom 에는 없어서 "캡처 없음"으로 대신한다.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
}

afterEach(() => {
  cleanup()
  // 다음 테스트가 이전 테스트의 연결 상태를 물려받지 않게 한다.
  fakeSocketStatus.reset()
  vi.unstubAllGlobals()
})
