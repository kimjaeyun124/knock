import { useEffect, useState, type ReactNode } from 'react'
import { deriveConnection } from '@/hooks/connection'
import { ConnectionContext } from '@/hooks/connectionContext'
import { useOnline } from '@/hooks/useOnline'
import { useServerStatus } from '@/hooks/useServerStatus'
import { useSocketStatus } from '@/hooks/useSocketStatus'

/**
 * 연결 상태를 한 곳에서 계산해 헤더·알림 배지·"최신 정보 아님" 안내가 같은 값을 보게 한다.
 * (각자 따로 계산하면 화면마다 상태가 달라 보일 수 있다)
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const online = useOnline()
  const server = useServerStatus()
  const socket = useSocketStatus()
  const info = deriveConnection({ online, server, socket })

  // "정상이던 마지막 시각": 정상에서 벗어나는 순간의 시각을 기억한다.
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null)
  useEffect(() => {
    if (info.state !== 'ok') return undefined
    return () => setLastOkAt(new Date())
  }, [info.state])

  return (
    <ConnectionContext.Provider value={{ ...info, lastOkAt }}>
      {children}
    </ConnectionContext.Provider>
  )
}
