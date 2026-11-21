// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// public/sw.js 는 빌드 없이 그대로 배포되므로, 파일을 그대로 읽어 가짜 service worker 전역에서 실행해 확인한다.
const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

interface Shown {
  title: string
  options: { body: string; tag: string; requireInteraction: boolean; data: { path: string } }
}

function load(windows: { focus(): Promise<void>; navigate?(path: string): Promise<void> }[] = []) {
  const listeners = new Map<string, (event: unknown) => void>()
  const shown: Shown[] = []
  const opened: string[] = []
  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    registration: {
      showNotification: (title: string, options: Shown['options']) => {
        shown.push({ title, options })
        return Promise.resolve()
      },
    },
    clients: {
      matchAll: () => Promise.resolve(windows),
      openWindow: (path: string) => {
        opened.push(path)
        return Promise.resolve()
      },
    },
  }
  // 서비스 워커처럼 전역 self 만 보이는 격리된 환경에서 실행한다.
  runInNewContext(source, { self })

  async function push(payload: unknown, raw?: string) {
    const waits: Promise<unknown>[] = []
    listeners.get('push')?.({
      data: { json: () => (raw !== undefined ? (JSON.parse(raw) as unknown) : payload) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
  }
  async function click(data: unknown) {
    const waits: Promise<unknown>[] = []
    let closed = false
    listeners.get('notificationclick')?.({
      notification: { data, close: () => (closed = true) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    })
    await Promise.all(waits)
    return closed
  }
  return { listeners, shown, opened, push, click }
}

describe('서비스 워커: 푸시 표시', () => {
  it('두 이벤트를 모두 등록한다', () => {
    const sw = load()
    expect([...sw.listeners.keys()].sort()).toEqual(['notificationclick', 'push'])
  })

  it('알림 푸시는 제목·내용을 그대로 보여 주고 같은 알림은 한 개로 합친다 (tag)', async () => {
    const sw = load()
    await sw.push({
      type: 'alert',
      alertId: 'alert-1',
      severity: 'URGENT',
      title: '현관 근처에서 움직임이 감지되었습니다',
      body: '앱에서 확인해 주세요.',
    })
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0]?.title).toBe('현관 근처에서 움직임이 감지되었습니다')
    expect(sw.shown[0]?.options).toMatchObject({
      body: '앱에서 확인해 주세요.',
      tag: 'alert-alert-1',
      requireInteraction: true, // 긴급은 닫기 전까지 남긴다
      data: { path: '/notifications/alert-1' },
    })
  })

  it('긴급이 아닌 알림은 저절로 사라질 수 있다', async () => {
    const sw = load()
    await sw.push({
      type: 'alert',
      alertId: 'a2',
      severity: 'NOTICE',
      title: '확인 필요',
      body: '',
    })
    expect(sw.shown[0]?.options.requireInteraction).toBe(false)
  })

  it('테스트 푸시는 알림이 아니라 설정 화면으로 이어진다', async () => {
    const sw = load()
    await sw.push({
      type: 'test',
      title: '테스트 알림입니다',
      body: '이 기기로 푸시 알림이 도착합니다.',
    })
    expect(sw.shown[0]?.options).toMatchObject({
      tag: 'tetris-test',
      data: { path: '/settings/notifications' },
    })
  })

  it('내용을 읽지 못해도 알림은 보여 준다 (조용히 사라지지 않음)', async () => {
    const sw = load()
    await sw.push(undefined, '이건 JSON 이 아님')
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0]?.title).toBe('새 알림이 있습니다')
  })

  it('알림 ID 에 특수 문자가 있어도 경로가 깨지지 않는다', async () => {
    const sw = load()
    await sw.push({ type: 'alert', alertId: 'a/b?c', severity: 'NOTICE', title: 't', body: '' })
    expect(sw.shown[0]?.options.data.path).toBe('/notifications/a%2Fb%3Fc')
  })
})

describe('서비스 워커: 알림 누르기', () => {
  it('열려 있는 앱 화면이 있으면 그 화면을 해당 경로로 보낸다', async () => {
    const calls: string[] = []
    const sw = load([
      {
        focus: () => {
          calls.push('focus')
          return Promise.resolve()
        },
        navigate: (path) => {
          calls.push(`navigate ${path}`)
          return Promise.resolve()
        },
      },
    ])
    expect(await sw.click({ path: '/notifications/alert-1' })).toBe(true) // 알림은 닫힌다
    expect(calls).toEqual(['focus', 'navigate /notifications/alert-1'])
    expect(sw.opened).toEqual([])
  })

  it('열려 있는 화면이 없으면 새 창으로 연다', async () => {
    const sw = load([])
    await sw.click({ path: '/notifications/alert-1' })
    expect(sw.opened).toEqual(['/notifications/alert-1'])
  })

  it.each([
    ['다른 사이트 주소', 'https://evil.example/phish'],
    ['스킴 없는 외부 주소', '//evil.example/phish'],
    ['경로 없음', undefined],
    ['문자열이 아님', 42],
  ])('앱 밖으로 향하는 경로는 홈으로 바꾼다: %s', async (_name, path) => {
    const sw = load([])
    await sw.click({ path })
    expect(sw.opened).toEqual(['/'])
  })
})
