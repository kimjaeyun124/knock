import {
  DeliveryError,
  type AlertMessage,
  type NotificationChannelAdapter,
  type NotificationRecipient,
} from './types'
import type { Channel } from '@tetris/shared'

/**
 * 아직 연동하지 않은 채널(브라우저 푸시·문자·카카오).
 * 보낸 척하지 않고 "연동되지 않음"으로 기록한다. 실제 연동은 이 어댑터를 같은 모양의 구현으로 바꿔 끼우면 된다.
 */
export class UnconfiguredAdapter implements NotificationChannelAdapter {
  readonly external = true

  constructor(readonly channel: Exclude<Channel, 'IN_APP'>) {}

  mode(): 'NOT_CONFIGURED' {
    return 'NOT_CONFIGURED'
  }

  send(_message: AlertMessage, _recipient: NotificationRecipient): Promise<void> {
    return Promise.reject(new DeliveryError('이 알림 채널은 연동되어 있지 않습니다.'))
  }

  sendTest(_recipient: NotificationRecipient): Promise<void> {
    return Promise.reject(new DeliveryError('이 알림 채널은 연동되어 있지 않습니다.'))
  }
}
