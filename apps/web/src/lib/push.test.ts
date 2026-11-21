import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStoredSubscriptionId, storeSubscriptionId, urlBase64ToUint8Array } from './push'

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('urlBase64ToUint8Array', () => {
  it('URL-safe base64 를 바이트로 바꾼다 (패딩이 없어도 됨)', () => {
    // "Hello?>" 의 URL-safe base64 = SGVsbG8_Pg (표준 base64 는 SGVsbG8/Pg==)
    expect([...urlBase64ToUint8Array('SGVsbG8_Pg')]).toEqual([72, 101, 108, 108, 111, 63, 62])
  })

  it('- 와 _ 를 표준 문자로 바꿔 읽는다', () => {
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255])
  })
})

describe('구독 ID 저장', () => {
  it('저장하고 지운다', () => {
    expect(readStoredSubscriptionId()).toBeNull()
    storeSubscriptionId('sub-1')
    expect(readStoredSubscriptionId()).toBe('sub-1')
    storeSubscriptionId(null)
    expect(readStoredSubscriptionId()).toBeNull()
  })

  it('저장소를 쓸 수 없어도 오류 없이 동작한다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredSubscriptionId()).toBeNull()
    expect(() => storeSubscriptionId('x')).not.toThrow()
  })
})
