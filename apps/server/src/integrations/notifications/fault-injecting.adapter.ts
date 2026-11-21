import type { FaultInjector } from '@/services/fault-injector'
import {
  DeliveryError,
  type AlertMessage,
  type NotificationChannelAdapter,
  type NotificationRecipient,
} from './types'

/**
 * 다른 채널 어댑터를 감싸 장애를 주입한다. (시뮬레이터가 켜져 있을 때만 쓰인다)
 * 시뮬레이션으로 만든 알림에만 적용하고, 실제 알림은 항상 감싼 어댑터로 그대로 보낸다.
 */
export class FaultInjectingAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannelAdapter['channel']
  readonly external: boolean

  constructor(
    private readonly inner: NotificationChannelAdapter,
    private readonly faults: FaultInjector,
  ) {
    this.channel = inner.channel
    this.external = inner.external
  }

  mode(): ReturnType<NotificationChannelAdapter['mode']> {
    return this.inner.mode()
  }

  send(message: AlertMessage, recipient: NotificationRecipient): Promise<void> {
    if (message.alert.origin === 'SIMULATED' && this.faults.isDeliveryFailureActive()) {
      return Promise.reject(
        new DeliveryError('시뮬레이션: 전달 실패를 주입했습니다. (실제 오류가 아닙니다)'),
      )
    }
    return this.inner.send(message, recipient)
  }

  /** 테스트 발송은 알림이 아니므로 장애를 주입하지 않는다. */
  sendTest(recipient: NotificationRecipient): Promise<void> {
    return this.inner.sendTest(recipient)
  }
}
