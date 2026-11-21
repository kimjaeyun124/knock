import { useCallback, useEffect, useState } from 'react'
import type { AlertNotifyPayload } from '@tetris/shared'
import { socket } from '@/lib/socket'
import { isAlertSoundEnabled, playAlertBeep } from '@/lib/soundPreference'

/**
 * 서버가 이 보호자에게 보낸 알림(alert.notify)을 배너로 쌓는다. 앱 화면이 열려 있을 때만 동작한다.
 * 같은 알림이 다시 오면(격상·재알림) 맨 위로 올리고, 확인·종료되면 배너를 치운다.
 */
export function useAlertNotifications() {
  const [banners, setBanners] = useState<AlertNotifyPayload[]>([])

  useEffect(() => {
    const onNotify = (payload: AlertNotifyPayload) => {
      setBanners((current) => [payload, ...current.filter((b) => b.alert.id !== payload.alert.id)])
      if (isAlertSoundEnabled()) playAlertBeep()
    }
    const onUpdated = ({ alert }: { alert: AlertNotifyPayload['alert'] }) => {
      if (alert.status !== 'OPEN') {
        setBanners((current) => current.filter((b) => b.alert.id !== alert.id))
      }
    }
    socket.on('alert.notify', onNotify)
    socket.on('alert.updated', onUpdated)
    return () => {
      socket.off('alert.notify', onNotify)
      socket.off('alert.updated', onUpdated)
    }
  }, [])

  const dismiss = useCallback((alertId: string) => {
    setBanners((current) => current.filter((b) => b.alert.id !== alertId))
  }, [])

  return { banners, dismiss }
}
