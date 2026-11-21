import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AppState } from 'react-native'
import { io, type Socket } from 'socket.io-client'
import { ApiError } from './api'
import { showAlertNotification } from './notify'
import { useSession } from './session'
import type { Alert, AlertNotify, Sensor } from './types'

export type Connection = 'connecting' | 'connected' | 'disconnected'

interface DataValue {
  alerts: Alert[] | null
  sensors: Sensor[] | null
  unread: number
  connection: Connection
  lastUpdated: Date | null
  error: string | null
  refreshing: boolean
  refresh: () => Promise<void>
}

const DataContext = createContext<DataValue | null>(null)

/**
 * 알림·센서 정보와 실시간 연결. 서버가 "alert.notify" 를 보내면 휴대폰 알림을 띄우고 목록을 다시 읽는다.
 * 연결이 끊기면 숨기지 않고 상태로 알리며, 다시 연결되면 놓친 내용을 API 로 다시 읽어 맞춘다.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const { api, serverUrl, token, prefs, signOut } = useSession()
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [sensors, setSensors] = useState<Sensor[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [a, s, u] = await Promise.all([api.alerts(), api.sensors(), api.unreadCount()])
      setAlerts(a.alerts)
      setSensors(s.sensors)
      setUnread(u.unread)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOut()
        return
      }
      setError(e instanceof Error ? e.message : '정보를 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }, [api, signOut])

  // 실시간 연결
  useEffect(() => {
    if (!token) return
    // 첫 읽기는 다음 틱에 한다. (effect 안에서 바로 상태를 바꾸지 않는다)
    const first = setTimeout(() => void refresh(), 0)
    const socket: Socket = io(serverUrl, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelayMax: 10_000,
    })
    // 다시 연결을 시도하는 동안은 "연결하는 중"으로 보인다. (처음 값도 connecting)
    socket.io.on('reconnect_attempt', () => setConnection('connecting'))
    socket.on('server:ready', () => {
      setConnection('connected')
      void refresh()
    })
    socket.on('disconnect', () => setConnection('disconnected'))
    socket.on('connect_error', (err: Error) => {
      setConnection('disconnected')
      if (err.message === 'UNAUTHORIZED') void signOut()
    })
    socket.on('alert.notify', (payload: AlertNotify) => {
      void showAlertNotification(payload.alert, prefsRef.current)
      void refresh()
    })
    for (const event of ['alert.created', 'alert.updated', 'alert.read', 'sensor.status']) {
      socket.on(event, () => void refresh())
    }
    // 앱이 다시 앞으로 오면 최신 정보로 맞춘다.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!socket.connected) socket.connect()
        void refresh()
      }
    })
    return () => {
      clearTimeout(first)
      sub.remove()
      socket.removeAllListeners()
      socket.close()
    }
  }, [serverUrl, token, refresh, signOut])

  const value = useMemo<DataValue>(
    () => ({ alerts, sensors, unread, connection, lastUpdated, error, refreshing, refresh }),
    [alerts, sensors, unread, connection, lastUpdated, error, refreshing, refresh],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataValue {
  const value = useContext(DataContext)
  if (!value) throw new Error('DataProvider 밖에서 useData 를 썼습니다.')
  return value
}
