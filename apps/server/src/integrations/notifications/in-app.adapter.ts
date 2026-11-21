import type { RealtimeGateway } from '@/realtime/gateway'
import {
  DeliveryError,
  type AlertMessage,
  type NotificationChannelAdapter,
  type NotificationRecipient,
} from './types'

/**
 * 앱 화면 알림. 해당 보호자의 열려 있는 화면에 실시간으로 보낸다.
 *
 * 한계: 보호자가 앱을 열어 두지 않았다면 전달되지 않는다. (잠든 보호자에게는 부족하다)
 * 화면이 하나도 받지 못하면 "전달 성공"으로 기록하지 않고 실패로 남겨, 사용자가 이 사실을 알 수 있게 한다.
 */
export class InAppAdapter implements NotificationChannelAdapter {
  readonly channel = 'IN_APP' as const
  readonly external = false

  constructor(private readonly gateway: RealtimeGateway) {}

  mode(): 'REAL' {
    return 'REAL'
  }

  async send(message: AlertMessage, recipient: NotificationRecipient): Promise<void> {
    const receivers = await this.gateway.emitToGuardian(recipient.id, 'alert.notify', {
      alert: message.alert,
      reason: message.reason,
    })
    if (receivers === 0) {
      throw new DeliveryError(
        '알림을 받을 앱 화면이 열려 있지 않습니다. (앱 화면이 열려 있을 때만 전달됩니다)',
      )
    }
  }

  async sendTest(recipient: NotificationRecipient): Promise<void> {
    const receivers = await this.gateway.emitToGuardian(recipient.id, 'notification.test', {
      sentAt: new Date().toISOString(),
    })
    if (receivers === 0) {
      throw new DeliveryError('테스트를 받을 앱 화면이 열려 있지 않습니다.')
    }
  }
}
