import type { AlertNotifyReason, Alert, Channel, ProviderMode } from '@tetris/shared'

export interface AlertMessage {
  alert: Alert
  reason: AlertNotifyReason
}

export interface NotificationRecipient {
  id: string
  displayName: string
}

/** 전달에 실패했을 때 던진다. message 는 보호자에게 그대로 보여 줄 수 있는 한국어 문장이어야 한다. */
export class DeliveryError extends Error {
  /**
   * 다시 시도해 볼 만한 실패인가. 일시적인 네트워크 오류처럼 시간이 지나면 풀릴 수 있으면 true(기본),
   * 구독이 없거나 만료됨·연동 안 됨처럼 다시 보내도 결과가 같으면 false 로 두어 바로 실패로 확정한다.
   */
  readonly retryable: boolean

  constructor(message: string, options?: ErrorOptions & { retryable?: boolean }) {
    super(message, options)
    this.name = 'DeliveryError'
    this.retryable = options?.retryable ?? true
  }
}

/** 채널 어댑터가 밝히는 지원 상태. 화면·문서가 구현된 것과 아닌 것을 구별하는 데 쓴다. */
export interface ChannelSupport {
  /** 이 채널을 서버가 실제로 보낼 수 있는가 */
  implemented: boolean
  /** 구현되지 않았거나 제한이 있을 때 사실대로 적은 설명 */
  note: string | null
}

/**
 * 알림 전달 채널. 앱 화면(IN_APP)·브라우저 푸시·문자·카카오가 같은 모양을 쓴다.
 * 실제 외부 서비스 연동은 이 인터페이스를 구현해 교체한다. (계획서 9.4)
 */
export interface NotificationChannelAdapter {
  readonly channel: Channel
  /** 앱 밖(외부 서비스)으로 나가는 채널인가. 시뮬레이션으로 만든 알림은 외부 채널로 보내지 않는다. */
  readonly external: boolean
  /** REAL: 실제 연동 / MOCK: 가짜 응답 / NOT_CONFIGURED: 연동되지 않음 */
  mode(): ProviderMode | 'NOT_CONFIGURED'
  /** 지원 여부. 지정하지 않으면 mode() 로만 판단한다. */
  support?(): ChannelSupport
  /** 성공하면 정상 반환, 실패하면 DeliveryError 를 던진다. */
  send(message: AlertMessage, recipient: NotificationRecipient): Promise<void>
  /** 설정 화면의 "테스트 발송". 알림(Alert)을 만들지 않고 이 채널이 실제로 도착하는지만 확인한다. */
  sendTest(recipient: NotificationRecipient): Promise<void>
}
