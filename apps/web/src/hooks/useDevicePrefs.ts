import { useSyncExternalStore } from 'react'
import {
  getDevicePrefs,
  setDevicePref,
  subscribeDevicePrefs,
  type DevicePrefs,
} from '@/lib/devicePrefs'

/** 이 기기에만 저장하는 화면 설정(테마·글자 크기·자동 새로고침). */
export function useDevicePrefs(): {
  prefs: DevicePrefs
  set: <K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) => void
} {
  const prefs = useSyncExternalStore(subscribeDevicePrefs, getDevicePrefs, getDevicePrefs)
  return { prefs, set: setDevicePref }
}
