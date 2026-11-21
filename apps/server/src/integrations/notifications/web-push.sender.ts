import { sendNotification } from 'web-push'
import { PushGoneError, type PushSender, type PushTarget } from './web-push.adapter'

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/** 알림은 오래되면 의미가 없으므로 푸시 서비스에 맡겨 두는 시간을 1시간으로 제한한다. */
const PUSH_TTL_SECONDS = 60 * 60
const PUSH_TIMEOUT_MS = 10_000

/** web-push 라이브러리로 실제 푸시 서비스(FCM, Mozilla 등)에 보낸다. */
export class LibraryPushSender implements PushSender {
  constructor(private readonly vapid: VapidConfig) {}

  async send(target: PushTarget, payload: string): Promise<void> {
    try {
      await sendNotification(target, payload, {
        vapidDetails: this.vapid,
        TTL: PUSH_TTL_SECONDS,
        urgency: 'high',
        timeout: PUSH_TIMEOUT_MS,
      })
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) throw new PushGoneError()
      throw error
    }
  }
}
