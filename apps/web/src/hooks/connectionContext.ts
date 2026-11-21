import { createContext, useContext } from 'react'
import type { ConnectionInfo } from './connection'

export interface ConnectionValue extends ConnectionInfo {
  /**
   * 마지막으로 "연결 정상"이었던 시각. 한 번도 정상이 아니었으면 null.
   * 연결이 끊겼을 때 화면의 정보가 언제 기준인지 알리는 데 쓴다.
   */
  lastOkAt: Date | null
}

export const ConnectionContext = createContext<ConnectionValue | null>(null)

export function useConnection(): ConnectionValue {
  const value = useContext(ConnectionContext)
  if (!value) throw new Error('ConnectionProvider 안에서만 연결 상태를 읽을 수 있습니다.')
  return value
}
