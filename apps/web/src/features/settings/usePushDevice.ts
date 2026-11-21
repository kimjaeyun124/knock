import { useCallback, useEffect, useState } from 'react'
import type { PushSubscriptionSummary } from '@tetris/shared'
import {
  currentPermission,
  getBrowserSubscription,
  isPushSupported,
  readStoredSubscriptionId,
  storeSubscriptionId,
  subscribeBrowser,
  unsubscribeBrowser,
  type PushPermission,
} from '@/lib/push'
import { ApiError } from '@/services/apiClient'
import { useRemovePushSubscription, useSubscribePush } from './hooks'

export interface PushDevice {
  supported: boolean
  permission: PushPermission
  /** 이 기기가 서버에 등록되어 있는가 (브라우저 구독이 있고, 서버 목록에 이 기기의 구독이 있음) */
  registered: boolean
  busy: boolean
  error: string | null
  enable(publicKey: string): Promise<void>
  disable(): Promise<void>
}

/** 이 브라우저(기기)를 푸시에 등록·해제한다. 서버가 아는 목록(servers)과 맞춰 "등록됨"을 판단한다. */
export function usePushDevice(servers: readonly PushSubscriptionSummary[] | undefined): PushDevice {
  const supported = isPushSupported()
  const [permission, setPermission] = useState<PushPermission>(() => currentPermission())
  const [browserSubscribed, setBrowserSubscribed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subscribe = useSubscribePush()
  const remove = useRemovePushSubscription()

  useEffect(() => {
    let cancelled = false
    getBrowserSubscription()
      .then((subscription) => {
        if (!cancelled) setBrowserSubscribed(subscription !== null)
      })
      .catch(() => {
        if (!cancelled) setBrowserSubscribed(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const storedId = readStoredSubscriptionId()
  const registered =
    browserSubscribed && storedId !== null && servers?.some((s) => s.id === storedId) === true

  const enable = useCallback(
    async (publicKey: string) => {
      setError(null)
      try {
        const input = await subscribeBrowser(publicKey)
        const result = await subscribe.mutateAsync(input)
        storeSubscriptionId(result.subscription.id)
        setBrowserSubscribed(true)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '푸시를 켜지 못했습니다.')
      } finally {
        setPermission(currentPermission())
      }
    },
    [subscribe],
  )

  const disable = useCallback(async () => {
    setError(null)
    try {
      const id = readStoredSubscriptionId()
      if (id) {
        try {
          await remove.mutateAsync(id)
        } catch (cause) {
          // 서버에 이미 없으면(404) 지운 것과 같다. 그 밖의 실패는 구독을 그대로 두고 알린다.
          if (!(cause instanceof ApiError && cause.status === 404)) throw cause
        }
      }
      await unsubscribeBrowser()
      storeSubscriptionId(null)
      setBrowserSubscribed(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '푸시를 끄지 못했습니다.')
    }
  }, [remove])

  return {
    supported,
    permission,
    registered,
    busy: subscribe.isPending || remove.isPending,
    error,
    enable,
    disable,
  }
}
