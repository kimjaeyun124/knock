import { usePushConfig, usePushSubscriptions } from './hooks'
import { usePushDevice, type PushDevice } from './usePushDevice'

export type BrowserNotificationState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'server-off' }
  | { kind: 'unsupported' }
  | { kind: 'denied' }
  | { kind: 'registered' }
  | { kind: 'ready'; publicKey: string }

/** 이 기기의 브라우저 알림 상태. 안내 화면과 요약 화면이 함께 쓴다. */
export function useBrowserNotificationState(): {
  state: BrowserNotificationState
  device: PushDevice
  retry: () => void
} {
  const config = usePushConfig()
  const configured = config.data?.configured === true
  const subscriptions = usePushSubscriptions(configured)
  const device = usePushDevice(subscriptions.data?.subscriptions)

  let state: BrowserNotificationState
  if (config.isError) state = { kind: 'error' }
  else if (!config.data) state = { kind: 'loading' }
  else if (!config.data.configured || !config.data.publicKey) state = { kind: 'server-off' }
  else if (!device.supported) state = { kind: 'unsupported' }
  else if (device.registered) state = { kind: 'registered' }
  else if (device.permission === 'denied') state = { kind: 'denied' }
  else state = { kind: 'ready', publicKey: config.data.publicKey }

  return { state, device, retry: () => void config.refetch() }
}
