/**
 * 이 기기(브라우저)에만 저장하는 화면 설정: 테마·글자 크기·자동 새로고침.
 * 서버 설정과 달리 기기마다 다를 수 있다. 저장소를 쓸 수 없으면(사생활 보호 모드 등) 이번 접속 동안만 유지된다.
 *
 * 값은 <html> 의 data 속성으로 반영된다. (styles/tokens-dark.css · index.css 가 이 속성을 읽는다)
 * 첫 화면이 그려지기 전에도 같은 값을 적용하도록 public/theme-init.js 가 같은 키를 읽는다.
 */

export const THEME_CHOICES = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

export const TEXT_SIZES = ['normal', 'large', 'xlarge'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

export const REFRESH_CHOICES = ['off', '30s', '1m', '5m'] as const
export type RefreshChoice = (typeof REFRESH_CHOICES)[number]

export const REFRESH_SECONDS: Record<RefreshChoice, number | null> = {
  off: null,
  '30s': 30,
  '1m': 60,
  '5m': 300,
}

export interface DevicePrefs {
  theme: ThemeChoice
  textSize: TextSize
  refresh: RefreshChoice
}

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  theme: 'system',
  textSize: 'normal',
  refresh: 'off',
}

const KEYS = {
  theme: 'tetris.theme',
  textSize: 'tetris.textSize',
  refresh: 'tetris.refresh',
} as const

function readOne<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return allowed.find((candidate) => candidate === value) ?? fallback
  } catch {
    return fallback
  }
}

let current: DevicePrefs = readAll()
const listeners = new Set<() => void>()

function readAll(): DevicePrefs {
  if (typeof window === 'undefined') return DEFAULT_DEVICE_PREFS
  return {
    theme: readOne(KEYS.theme, THEME_CHOICES, DEFAULT_DEVICE_PREFS.theme),
    textSize: readOne(KEYS.textSize, TEXT_SIZES, DEFAULT_DEVICE_PREFS.textSize),
    refresh: readOne(KEYS.refresh, REFRESH_CHOICES, DEFAULT_DEVICE_PREFS.refresh),
  }
}

export function getDevicePrefs(): DevicePrefs {
  return current
}

export function setDevicePref<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]): void {
  current = { ...current, [key]: value }
  try {
    window.localStorage.setItem(KEYS[key], value)
  } catch {
    // 저장할 수 없어도 이번 접속에서는 적용된다.
  }
  applyDevicePrefs()
  listeners.forEach((listener) => listener())
}

export function subscribeDevicePrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** "시스템" 은 기기(운영체제)의 밝기 설정을 따른다. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): 'light' | 'dark' {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/** 현재 설정을 화면(<html>)에 반영한다. */
export function applyDevicePrefs(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = resolveTheme(current.theme, systemPrefersDark())
  root.dataset.textSize = current.textSize
}
