import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { DeliveryError } from './types'
import { PushGoneError, WebPushAdapter, type PushSender } from './web-push.adapter'

const logger = pino({ level: 'silent' })
const sub = { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }

function adapterWith(subscriptions: (typeof sub)[], sender: PushSender) {
  const deleted: string[] = []
  const prisma = {
    pushSubscription: {
      findMany: () => Promise.resolve(subscriptions),
      delete: ({ where }: { where: { id: string } }) => {
        deleted.push(where.id)
        return Promise.resolve({})
      },
    },
  }
  return { adapter: new WebPushAdapter(prisma as never, sender, logger), deleted }
}

const recipient = { id: 'g1', displayName: '보호자' }

describe('웹 푸시 실패의 재시도 가능 여부', () => {
  it('등록된 기기가 없으면 다시 시도해도 같으므로 재시도하지 않는다', async () => {
    const { adapter } = adapterWith([], { send: () => Promise.resolve() })
    const error = await adapter.sendTest(recipient).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DeliveryError)
    expect((error as DeliveryError).retryable).toBe(false)
  })

  it('구독이 만료(404/410)된 기기는 목록에서 지우고, 받을 곳이 남지 않으면 재시도하지 않는다', async () => {
    const { adapter, deleted } = adapterWith([sub], {
      send: () => Promise.reject(new PushGoneError()),
    })
    const error = await adapter.sendTest(recipient).catch((e: unknown) => e)
    expect(deleted).toEqual(['s1'])
    expect((error as DeliveryError).retryable).toBe(false)
    expect((error as DeliveryError).message).toContain('만료')
  })

  it('푸시 서비스 오류·네트워크 오류는 일시적일 수 있으므로 재시도한다', async () => {
    const { adapter, deleted } = adapterWith([sub], {
      send: () => Promise.reject(new Error('ECONNRESET')),
    })
    const error = await adapter.sendTest(recipient).catch((e: unknown) => e)
    expect(deleted).toEqual([]) // 일시적 오류로 기기를 지우지 않는다
    expect((error as DeliveryError).retryable).toBe(true)
  })
})
