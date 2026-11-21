import { useEffect } from 'react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { connectSocket, disconnectSocket } from '@/lib/socket'

/** 로그인한 동안에만 실시간 연결을 유지한다. (서버가 로그인 쿠키 없는 연결을 거부한다) */
export function RealtimeConnector() {
  // 이벤트 구독을 먼저 걸어 두어야 첫 연결 때 보내는 신호를 놓치지 않는다.
  useRealtimeSync()
  useEffect(() => {
    connectSocket()
    return disconnectSocket
  }, [])
  return null
}
