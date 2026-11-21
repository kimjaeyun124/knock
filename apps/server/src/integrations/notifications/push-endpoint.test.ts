import { describe, expect, it } from 'vitest'
import { isSafePushEndpoint } from './push-endpoint'

describe('isSafePushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/xyz',
    'https://web.push.apple.com/QAbc',
  ])('실제 푸시 서비스 주소는 허용한다: %s', (url) => {
    expect(isSafePushEndpoint(url)).toBe(true)
  })

  it.each([
    ['http (암호화 없음)', 'http://fcm.googleapis.com/x'],
    ['localhost', 'https://localhost/x'],
    ['한 단어 이름', 'https://intranet/x'],
    ['IPv4 직접 지정', 'https://127.0.0.1/x'],
    ['사설 IPv4', 'https://192.168.0.10/x'],
    ['IPv6 직접 지정', 'https://[::1]/x'],
    ['정수 형태 IP', 'https://2130706433/x'],
    ['.internal', 'https://metadata.google.internal/x'],
    ['.local', 'https://printer.local/x'],
    ['포트 지정', 'https://push.example.com:8443/x'],
    ['사용자 정보', 'https://user:pw@push.example.com/x'],
    ['주소가 아님', 'not a url'],
    ['file 스킴', 'file:///etc/passwd'],
  ])('내부로 향할 수 있는 주소는 거부한다: %s', (_name, url) => {
    expect(isSafePushEndpoint(url)).toBe(false)
  })
})
