import type { PushSubscriptionInput } from '@tetris/shared'

/** 이 브라우저가 푸시를 받을 수 있는가. (iPhone·iPad 는 홈 화면에 추가한 웹앱에서만 가능) */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type PushPermission = 'default' | 'granted' | 'denied'

export function currentPermission(): PushPermission {
  return typeof Notification === 'undefined' ? 'denied' : Notification.permission
}

/** 서버의 공개 키(URL-safe base64)를 브라우저가 요구하는 바이트 배열로 바꾼다. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

/** 이 브라우저의 현재 푸시 구독. 없으면 null */
export async function getBrowserSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

/** 알림 권한을 요청하고 이 브라우저를 푸시에 구독시킨다. 서버에 알릴 내용을 돌려준다. */
export async function subscribeBrowser(publicKey: string): Promise<PushSubscriptionInput> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      '알림 권한이 허용되지 않았습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.',
    )
  }
  const reg = await registration()
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('이 브라우저가 푸시 구독 정보를 만들지 못했습니다.')
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}

/** 이 브라우저의 푸시 구독을 해제한다. 구독이 없었으면 아무 일도 하지 않는다. */
export async function unsubscribeBrowser(): Promise<void> {
  const subscription = await getBrowserSubscription()
  await subscription?.unsubscribe()
}

const STORAGE_KEY = 'tetris.pushSubscriptionId'

/** 이 기기가 서버에 등록한 구독 ID. 저장소를 쓸 수 없으면 null (그 경우 "등록됨" 표시가 되지 않을 뿐 동작은 한다). */
export function readStoredSubscriptionId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeSubscriptionId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 저장하지 못해도 푸시 등록 자체는 유효하다.
  }
}
