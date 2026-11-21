import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PushGoneError } from './web-push.adapter'
import { LibraryPushSender } from './web-push.sender'

// web-push 는 ESM 이라 함수를 직접 바꿔치기할 수 없어 모듈 전체를 가짜로 대체한다.
// (vi.fn 의 호출 추적이 거부된 Promise 를 처리하지 않은 것으로 보고하는 일을 피하려고 일반 함수로 감싼다)
type SendArgs = [unknown, string, Record<string, unknown>]
let behavior: (...args: SendArgs) => Promise<unknown> = () => Promise.resolve({ statusCode: 201 })
const calls: SendArgs[] = []
vi.mock('web-push', () => ({
  sendNotification: (...args: SendArgs) => {
    calls.push(args)
    return behavior(...args)
  },
}))

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@example.com' }
const target = { endpoint: 'https://push.example.com/x', keys: { p256dh: 'k', auth: 'a' } }

beforeEach(() => {
  calls.length = 0
  behavior = () => Promise.resolve({ statusCode: 201 })
})

describe('LibraryPushSender', () => {
  it('VAPID 정보, 유효 시간, 제한 시간을 붙여 보낸다', async () => {
    await new LibraryPushSender(vapid).send(target, '{"a":1}')
    expect(calls).toEqual([
      [target, '{"a":1}', { vapidDetails: vapid, TTL: 3600, urgency: 'high', timeout: 10_000 }],
    ])
  })

  it.each([404, 410])('푸시 서비스가 %i 로 답하면 구독 만료로 다룬다', async (statusCode) => {
    behavior = () => Promise.reject(Object.assign(new Error('gone'), { statusCode }))
    await expect(new LibraryPushSender(vapid).send(target, '{}')).rejects.toBeInstanceOf(
      PushGoneError,
    )
  })

  it('그 밖의 실패(5xx 등)는 만료로 착각하지 않고 그대로 던진다', async () => {
    behavior = () => Promise.reject(Object.assign(new Error('boom'), { statusCode: 500 }))
    await expect(new LibraryPushSender(vapid).send(target, '{}')).rejects.toThrow('boom')
  })
})
