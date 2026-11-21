import {
  DeliveryError,
  type AlertMessage,
  type ChannelSupport,
  type NotificationChannelAdapter,
  type NotificationRecipient,
} from './types'

export const WATCH_PLATFORMS = ['APPLE_WATCH', 'WEAR_OS'] as const
export type WatchPlatform = (typeof WATCH_PLATFORMS)[number]

export interface WatchPlatformSupport {
  platform: WatchPlatform
  label: string
  /** 지금 이 서버에서 전달이 되는가. 네이티브 앱이 없어 모두 false */
  deliverable: false
  /** 이 플랫폼에 전달하려면 새로 만들어야 하는 것 */
  requires: string[]
}

/** 스마트워치 전달에 필요한 작업. 지금은 하나도 만들어져 있지 않다. (docs/WATCH_INTEGRATION.md) */
export const WATCH_PLATFORM_SUPPORT: readonly WatchPlatformSupport[] = [
  {
    platform: 'APPLE_WATCH',
    label: 'Apple Watch',
    deliverable: false,
    requires: [
      'iPhone 앱(APNs 푸시 등록, Apple Developer Program 계정)',
      'APNs 인증 키와 서버의 APNs 전송 구현',
      '실제 iPhone·Apple Watch 기기 시험',
    ],
  },
  {
    platform: 'WEAR_OS',
    label: 'Wear OS',
    deliverable: false,
    requires: [
      'Android 앱(FCM 토큰 등록)',
      'Firebase 프로젝트와 서버의 FCM 전송 구현',
      '실제 Android 폰·Wear OS 기기 시험',
    ],
  },
]

const NOT_IMPLEMENTED = '스마트워치로 알림을 보내는 기능은 아직 만들지 않았습니다.'

/**
 * 스마트워치 알림 채널의 자리(추후 연동용).
 * 웹 서버가 직접 워치로 알림을 보낼 수 없고 휴대폰 앱(iOS·Android)이 필요하므로, 지금은 보낸 척하지 않고
 * "연동되지 않음"으로만 보고한다. 네이티브 앱과 전송 구현이 생기면 이 클래스를 같은 인터페이스의 구현으로 바꿔 끼운다.
 */
export class WatchNotificationAdapter implements NotificationChannelAdapter {
  readonly channel = 'WATCH' as const
  readonly external = true

  mode(): 'NOT_CONFIGURED' {
    return 'NOT_CONFIGURED'
  }

  support(): ChannelSupport {
    return { implemented: false, note: NOT_IMPLEMENTED }
  }

  platforms(): readonly WatchPlatformSupport[] {
    return WATCH_PLATFORM_SUPPORT
  }

  send(_message: AlertMessage, _recipient: NotificationRecipient): Promise<void> {
    return Promise.reject(new DeliveryError(NOT_IMPLEMENTED, { retryable: false }))
  }

  sendTest(_recipient: NotificationRecipient): Promise<void> {
    return Promise.reject(new DeliveryError(NOT_IMPLEMENTED, { retryable: false }))
  }
}
