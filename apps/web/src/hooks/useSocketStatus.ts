import { useSyncExternalStore } from 'react'
import {
  getSocketInfo,
  getSocketStatus,
  subscribeSocketStatus,
  type SocketInfo,
  type SocketStatus,
} from '@/lib/socket'

export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(subscribeSocketStatus, getSocketStatus, getSocketStatus)
}

/** 연결 상태에 더해 재연결 횟수·마지막 연결 시각·마지막 오류 */
export function useSocketInfo(): SocketInfo {
  return useSyncExternalStore(subscribeSocketStatus, getSocketInfo, getSocketInfo)
}
