import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return import('./devicePrefs')
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-text-size')
})
afterEach(() => vi.restoreAllMocks())

describe('기기 설정 (테마·글자 크기·새로고침)', () => {
  it('저장된 값이 없으면 기본값(기기 설정 따르기·보통·끄기)이다', async () => {
    const mod = await load()
    expect(mod.getDevicePrefs()).toEqual({ theme: 'system', textSize: 'normal', refresh: 'off' })
  })

  it('고르면 저장하고 <html> 속성에 반영한다', async () => {
    const mod = await load()
    mod.setDevicePref('theme', 'dark')
    mod.setDevicePref('textSize', 'xlarge')
    mod.setDevicePref('refresh', '1m')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.textSize).toBe('xlarge')
    expect(window.localStorage.getItem('tetris.theme')).toBe('dark')
    expect(window.localStorage.getItem('tetris.refresh')).toBe('1m')
    // 다시 불러와도 유지된다.
    const again = await load()
    expect(again.getDevicePrefs()).toEqual({ theme: 'dark', textSize: 'xlarge', refresh: '1m' })
  })

  it('알 수 없는 저장값은 무시하고 기본값을 쓴다', async () => {
    window.localStorage.setItem('tetris.theme', 'neon')
    window.localStorage.setItem('tetris.textSize', '999')
    const mod = await load()
    expect(mod.getDevicePrefs()).toMatchObject({ theme: 'system', textSize: 'normal' })
  })

  it('저장소를 쓸 수 없어도 이번 접속에서는 적용된다', async () => {
    const mod = await load()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => mod.setDevicePref('theme', 'light')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(mod.getDevicePrefs().theme).toBe('light')
  })

  it('"기기 설정 따르기"는 운영체제의 밝기 설정을 따른다', async () => {
    const mod = await load()
    expect(mod.resolveTheme('system', true)).toBe('dark')
    expect(mod.resolveTheme('system', false)).toBe('light')
    expect(mod.resolveTheme('light', true)).toBe('light')
    expect(mod.resolveTheme('dark', false)).toBe('dark')
  })

  it('새로고침 간격은 초 단위로 정해져 있다', async () => {
    const mod = await load()
    expect(mod.REFRESH_SECONDS).toEqual({ off: null, '30s': 30, '1m': 60, '5m': 300 })
  })
})
