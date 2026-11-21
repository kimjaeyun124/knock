import type { PrismaClient } from '@/db/client'
import type { Logger } from '@/utils/logger'
import {
  DeliveryError,
  type AlertMessage,
  type NotificationChannelAdapter,
  type NotificationRecipient,
} from './types'

/** 푸시 서비스가 구독이 더는 유효하지 않다고 답했다 (404/410). 그 기기는 목록에서 지운다. */
export class PushGoneError extends Error {
  constructor() {
    super('푸시 구독이 만료되었습니다.')
    this.name = 'PushGoneError'
  }
}

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** 푸시 한 건을 푸시 서비스로 보낸다. 실제 구현은 web-push 라이브러리, 테스트는 가짜로 바꾼다. */
export interface PushSender {
  send(target: PushTarget, payload: string): Promise<void>
}

/** 서비스 워커(apps/web/public/sw.js)가 받는 푸시 내용 */
export type PushPayload =
  | { type: 'alert'; alertId: string; severity: string; title: string; body: string }
  | { type: 'test'; title: string; body: string }

/**
 * 브라우저 푸시. 보호자가 등록한 기기(PushSubscription)마다 보낸다.
 * 한 기기라도 받으면 성공, 모두 실패하거나 등록된 기기가 없으면 실패로 남긴다. (성공한 척하지 않음)
 */
export class WebPushAdapter implements NotificationChannelAdapter {
  readonly channel = 'WEB_PUSH' as const
  readonly external = true

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender: PushSender,
    private readonly logger: Logger,
  ) {}

  mode(): 'REAL' {
    return 'REAL'
  }

  send(message: AlertMessage, recipient: NotificationRecipient): Promise<void> {
    const { alert } = message
    return this.deliver(recipient.id, {
      type: 'alert',
      alertId: alert.id,
      severity: alert.severity,
      title: alert.title,
      body: '앱에서 확인해 주세요.',
    })
  }

  sendTest(recipient: NotificationRecipient): Promise<void> {
    return this.deliver(recipient.id, {
      type: 'test',
      title: '테스트 알림입니다',
      body: '이 기기로 푸시 알림이 도착합니다.',
    })
  }

  private async deliver(guardianId: string, payload: PushPayload): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { guardianId } })
    if (subscriptions.length === 0) {
      throw new DeliveryError(
        '푸시를 받도록 등록한 기기가 없습니다. (설정 → 알림 채널에서 이 기기를 등록해 주세요)',
        { retryable: false },
      )
    }

    const body = JSON.stringify(payload)
    let delivered = 0
    let lastError = ''
    let anyTransient = false
    for (const subscription of subscriptions) {
      try {
        await this.sender.send(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
        )
        delivered += 1
      } catch (error) {
        if (error instanceof PushGoneError) {
          await this.prisma.pushSubscription
            .delete({ where: { id: subscription.id } })
            .catch(() => undefined)
          lastError = '등록한 기기의 푸시 구독이 만료되어 목록에서 지웠습니다.'
        } else {
          lastError = '푸시 서비스가 요청을 받지 않았습니다.'
          anyTransient = true
          this.logger.warn({ err: error, subscriptionId: subscription.id }, '푸시 전송 실패')
        }
      }
    }
    // 모든 기기의 구독이 만료되어 지워진 경우는 다시 보내도 받을 곳이 없으므로 바로 실패로 확정한다.
    if (delivered === 0) {
      throw new DeliveryError(`푸시를 보내지 못했습니다. ${lastError}`, { retryable: anyTransient })
    }
  }
}
