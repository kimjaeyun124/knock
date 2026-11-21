import { describe, expect, it } from 'vitest'
import { canPlayOnDevice, formatRelative, normalizeServerUrl } from '../format'
import { FORBIDDEN_PHRASES } from '../labels'
import { deriveOverallStatus } from '../status'
import type { Alert, Sensor } from '../types'

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'a1',
  type: 'ENTRANCE_APPROACH',
  severity: 'URGENT',
  status: 'OPEN',
  origin: 'REAL',
  title: '현관 근처에서 움직임이 감지되었습니다',
  message: '확인해 주세요.',
  sensorName: '현관문',
  triggeredAt: '2026-11-20T14:00:00.000Z',
  lastEventAt: '2026-11-20T14:00:00.000Z',
  occurrences: 1,
  acknowledgedAt: null,
  resolvedAt: null,
  ...over,
})
const sensor = (over: Partial<Sensor> = {}): Sensor => ({
  id: 's1',
  name: '침대 옆',
  zone: 'BED_SIDE',
  origin: 'REAL',
  isActive: true,
  state: 'ONLINE',
  lastSeenAt: '2026-11-20T14:00:00.000Z',
  batteryPercent: 90,
  ...over,
})

describe('첫 화면의 큰 상태', () => {
  it('정보를 받지 못했으면 "상태 확인 불가"이고 괜찮다고 보이지 않는다', () => {
    const s = deriveOverallStatus({ alerts: null, sensors: [sensor()], connected: true })
    expect(s).toMatchObject({ tone: 'muted', label: '상태 확인 불가' })
  })

  it('진행 중인 긴급 알림이 가장 앞선다', () => {
    const s = deriveOverallStatus({
      alerts: [alert({ id: 'n', severity: 'NOTICE' }), alert({ id: 'u' })],
      sensors: [sensor({ state: 'OFFLINE' })],
      connected: true,
    })
    expect(s).toMatchObject({ tone: 'danger', label: '즉시 확인 권장', alertId: 'u' })
  })

  it('확인했거나 종료한 알림은 큰 상태를 바꾸지 않는다', () => {
    const s = deriveOverallStatus({
      alerts: [alert({ status: 'ACKNOWLEDGED' }), alert({ id: 'x', status: 'RESOLVED' })],
      sensors: [sensor()],
      connected: true,
    })
    expect(s.label).toBe('모니터링 중')
  })

  it('확인 필요 알림 다음은 연결이 끊긴 센서다', () => {
    expect(
      deriveOverallStatus({
        alerts: [alert({ severity: 'NOTICE' })],
        sensors: [sensor()],
        connected: true,
      }).label,
    ).toBe('확인 필요')
    const offline = deriveOverallStatus({
      alerts: [],
      sensors: [sensor({ state: 'OFFLINE' })],
      connected: true,
    })
    expect(offline).toMatchObject({ tone: 'warn', label: '모니터링 불완전' })
    expect(offline.headline).toContain('1개')
  })

  it('사용 중인 센서가 없으면 그렇게 알린다 (꺼 둔 센서는 세지 않는다)', () => {
    const s = deriveOverallStatus({
      alerts: [],
      sensors: [sensor({ isActive: false, state: 'OFFLINE' })],
      connected: true,
    })
    expect(s.label).toBe('센서 없음')
  })

  it('정상일 때도 실시간 연결이 끊겨 있으면 숨기지 않는다', () => {
    const s = deriveOverallStatus({ alerts: [], sensors: [sensor()], connected: false })
    expect(s.label).toBe('모니터링 중')
    expect(s.headline).toContain('다시 시도')
  })

  it('어떤 상태 문구도 단정적 표현을 쓰지 않는다', () => {
    const all = [
      deriveOverallStatus({ alerts: null, sensors: null, connected: false }),
      deriveOverallStatus({ alerts: [], sensors: [], connected: true }),
      deriveOverallStatus({ alerts: [], sensors: [sensor()], connected: true }),
      deriveOverallStatus({ alerts: [], sensors: [sensor({ state: 'OFFLINE' })], connected: true }),
    ]
    for (const s of all) {
      for (const word of FORBIDDEN_PHRASES) {
        expect(s.label + s.headline, word).not.toContain(word)
      }
    }
  })
})

describe('서버 주소 정리', () => {
  it('끝의 / 와 공백을 지우고 http(s) 주소만 받는다', () => {
    expect(normalizeServerUrl(' http://192.168.0.12:4000/ ')).toBe('http://192.168.0.12:4000')
    expect(normalizeServerUrl('https://knock.example.com')).toBe('https://knock.example.com')
    expect(normalizeServerUrl('localhost:4000')).toBeNull()
    expect(normalizeServerUrl('ftp://x')).toBeNull()
    expect(normalizeServerUrl('http://a b')).toBeNull()
    expect(normalizeServerUrl('http://host/path')).toBeNull()
  })
})

describe('상대 시각', () => {
  const now = new Date('2026-11-20T14:10:00.000Z')
  it('방금 전·분·시간 전으로 보여 준다', () => {
    expect(formatRelative('2026-11-20T14:09:40.000Z', now)).toBe('방금 전')
    expect(formatRelative('2026-11-20T14:05:00.000Z', now)).toBe('5분 전')
    expect(formatRelative('2026-11-20T11:10:00.000Z', now)).toBe('3시간 전')
  })
})

describe('영상 재생 가능 여부', () => {
  it('아이폰은 webm 을 재생하지 못하고 mp4 는 재생한다. 안드로이드는 둘 다 재생한다', () => {
    expect(canPlayOnDevice('video/webm', 'ios')).toBe(false)
    expect(canPlayOnDevice('video/mp4', 'ios')).toBe(true)
    expect(canPlayOnDevice('video/webm', 'android')).toBe(true)
    expect(canPlayOnDevice('video/mp4', 'android')).toBe(true)
  })
})
