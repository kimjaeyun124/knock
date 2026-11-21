import * as Haptics from 'expo-haptics'
import * as Notifications from 'expo-notifications'
import { AndroidImportance } from 'expo-notifications'
import { Platform } from 'react-native'
import { SEVERITY } from './labels'
import type { Alert } from './types'

const CHANNEL_ID = 'knock-alerts'

/** 앱이 앞에 있을 때도 휴대폰 알림(배너·소리)을 보이게 한다. */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
})

/** 알림 권한을 묻고(처음 한 번), Android 알림 채널을 만든다. 허용되었는지 돌려준다. */
export async function prepareNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '노크 알림',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#4F46E5',
    })
  }
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  const asked = await Notifications.requestPermissionsAsync()
  return asked.granted
}

export async function notificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted
}

/**
 * 서버가 보낸 새 알림을 휴대폰 알림으로 띄운다. (앱이 실행 중일 때. 앱이 완전히 닫혀 있으면 오지 않는다)
 * 문구는 서버가 정한 그대로 쓴다. (단정적 표현을 쓰지 않는 서버 문구)
 */
export async function showAlertNotification(
  alert: Alert,
  options: { sound: boolean; urgentOnly: boolean },
): Promise<boolean> {
  if (options.urgentOnly && alert.severity !== 'URGENT') return false
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `[${SEVERITY[alert.severity].label}] ${alert.title}`,
      body: alert.message,
      sound: options.sound,
      data: { alertId: alert.id },
      ...(Platform.OS === 'android'
        ? {}
        : { interruptionLevel: alert.severity === 'URGENT' ? 'timeSensitive' : 'active' }),
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  })
  if (options.sound) {
    await Haptics.notificationAsync(
      alert.severity === 'URGENT'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => undefined)
  }
  return true
}
