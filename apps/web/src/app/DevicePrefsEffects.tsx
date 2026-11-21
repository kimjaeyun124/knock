import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useDevicePrefs } from '@/hooks/useDevicePrefs'
import { applyDevicePrefs, REFRESH_SECONDS } from '@/lib/devicePrefs'

/**
 * 기기 설정을 실제 화면 동작에 반영한다. (화면에 아무것도 그리지 않는다)
 * - 테마·글자 크기: <html> 속성. "시스템" 테마는 기기의 밝기 설정이 바뀌면 따라간다.
 * - 자동 새로고침: 정한 간격마다, 화면이 보이고 인터넷이 연결된 때만 서버 데이터를 다시 읽는다.
 */
export function DevicePrefsEffects() {
  const queryClient = useQueryClient()
  const { prefs } = useDevicePrefs()

  useEffect(() => {
    applyDevicePrefs()
    if (prefs.theme !== 'system' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', applyDevicePrefs)
    return () => query.removeEventListener('change', applyDevicePrefs)
  }, [prefs.theme, prefs.textSize])

  useEffect(() => {
    const seconds = REFRESH_SECONDS[prefs.refresh]
    if (seconds === null) return undefined
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void queryClient.invalidateQueries()
      }
    }, seconds * 1000)
    return () => window.clearInterval(timer)
  }, [prefs.refresh, queryClient])

  return null
}
