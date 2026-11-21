import { useSyncExternalStore } from 'react'
import {
  isAlertSoundEnabled,
  setAlertSoundEnabled,
  subscribeAlertSound,
} from '@/lib/soundPreference'

export function useAlertSound(): { enabled: boolean; setEnabled: (next: boolean) => void } {
  const enabled = useSyncExternalStore(
    subscribeAlertSound,
    isAlertSoundEnabled,
    isAlertSoundEnabled,
  )
  return { enabled, setEnabled: setAlertSoundEnabled }
}
