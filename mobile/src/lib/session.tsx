import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Platform } from 'react-native'
import { createApi, type Api } from './api'
import type { Guardian, Household } from './types'

/** 시뮬레이터·에뮬레이터에서 이 Mac 의 개발 서버에 닿는 기본 주소 */
export const DEFAULT_SERVER_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000'

const KEYS = {
  server: 'knock.serverUrl',
  token: 'knock.token',
  profile: 'knock.profile',
  sound: 'knock.sound',
  urgentOnly: 'knock.urgentOnly',
} as const

interface Profile {
  guardian: Guardian
  household: Household
  expiresAt: string
}

export interface Preferences {
  /** 새 알림이 오면 소리·진동으로 알린다 */
  sound: boolean
  /** "즉시 확인 권장"만 휴대폰 알림으로 띄운다 (앱 안 목록에는 모두 나온다) */
  urgentOnly: boolean
}

interface SessionValue {
  status: 'loading' | 'signedOut' | 'signedIn'
  serverUrl: string
  token: string | null
  profile: Profile | null
  prefs: Preferences
  api: Api
  signIn: (serverUrl: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setPrefs: (next: Partial<Preferences>) => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * 로그인 상태. 세션 토큰은 기기의 보안 저장소(iOS 키체인·Android Keystore)에만 둔다.
 * 토큰이 만료되었거나 서버가 401 을 주면 로그아웃 상태로 돌아간다.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading')
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL)
  const [token, setToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [prefs, setPrefsState] = useState<Preferences>({ sound: true, urgentOnly: false })

  useEffect(() => {
    void (async () => {
      const [savedServer, savedToken, savedProfile, sound, urgentOnly] = await Promise.all([
        SecureStore.getItemAsync(KEYS.server),
        SecureStore.getItemAsync(KEYS.token),
        SecureStore.getItemAsync(KEYS.profile),
        SecureStore.getItemAsync(KEYS.sound),
        SecureStore.getItemAsync(KEYS.urgentOnly),
      ])
      if (savedServer) setServerUrl(savedServer)
      setPrefsState({ sound: sound !== 'false', urgentOnly: urgentOnly === 'true' })
      const parsed = savedProfile ? (JSON.parse(savedProfile) as Profile) : null
      if (savedToken && parsed && new Date(parsed.expiresAt).getTime() > Date.now()) {
        setToken(savedToken)
        setProfile(parsed)
        setStatus('signedIn')
      } else {
        setStatus('signedOut')
      }
    })()
  }, [])

  const signIn = useCallback(async (url: string, email: string, password: string) => {
    const result = await createApi(url, null).login(email, password)
    const nextProfile: Profile = {
      guardian: result.guardian,
      household: result.household,
      expiresAt: result.expiresAt,
    }
    await Promise.all([
      SecureStore.setItemAsync(KEYS.server, url),
      SecureStore.setItemAsync(KEYS.token, result.token),
      SecureStore.setItemAsync(KEYS.profile, JSON.stringify(nextProfile)),
    ])
    setServerUrl(url)
    setToken(result.token)
    setProfile(nextProfile)
    setStatus('signedIn')
  }, [])

  const signOut = useCallback(async () => {
    const current = token
    setToken(null)
    setProfile(null)
    setStatus('signedOut')
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.token),
      SecureStore.deleteItemAsync(KEYS.profile),
    ])
    // 서버의 세션도 끊는다. 실패해도(오프라인 등) 이 기기에서는 이미 로그아웃되었다.
    if (current)
      await createApi(serverUrl, current)
        .logout()
        .catch(() => undefined)
  }, [serverUrl, token])

  const setPrefs = useCallback(async (next: Partial<Preferences>) => {
    setPrefsState((prev) => ({ ...prev, ...next }))
    if (next.sound !== undefined) await SecureStore.setItemAsync(KEYS.sound, String(next.sound))
    if (next.urgentOnly !== undefined) {
      await SecureStore.setItemAsync(KEYS.urgentOnly, String(next.urgentOnly))
    }
  }, [])

  const api = useMemo(() => createApi(serverUrl, token), [serverUrl, token])
  const value = useMemo<SessionValue>(
    () => ({ status, serverUrl, token, profile, prefs, api, signIn, signOut, setPrefs }),
    [status, serverUrl, token, profile, prefs, api, signIn, signOut, setPrefs],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('SessionProvider 밖에서 useSession 을 썼습니다.')
  return value
}
