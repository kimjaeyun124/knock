import { createECDH, randomBytes } from 'node:crypto'
import { generateRequestDetails, generateVAPIDKeys } from 'web-push'
import { describe, expect, it } from 'vitest'

/**
 * 실제 web-push 라이브러리로 푸시 요청을 만들어 본다. (네트워크로 보내지는 않는다)
 * 우리가 쓰는 설정 모양(VAPID 키, mailto 연락처)과 브라우저가 주는 구독 정보 모양이
 * 라이브러리가 받아들이는 형식인지, 그리고 내용이 암호화되는지 확인한다.
 */
describe('web-push 라이브러리 연동 형식', () => {
  // 브라우저가 만들어 주는 구독 키와 같은 형식: P-256 공개 키(65바이트)와 16바이트 인증 비밀
  const browser = createECDH('prime256v1')
  browser.generateKeys()
  const subscription = {
    endpoint: 'https://push.example.com/send/device-1',
    keys: {
      p256dh: browser.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  }
  const vapid = { ...generateVAPIDKeys(), subject: 'mailto:ops@example.com' }

  it('VAPID 키 쌍을 만들 수 있고 공개 키는 브라우저가 쓰는 형식이다', () => {
    expect(Buffer.from(vapid.publicKey, 'base64url')).toHaveLength(65) // 압축하지 않은 P-256 공개 키
    expect(Buffer.from(vapid.privateKey, 'base64url')).toHaveLength(32)
  })

  it('내용은 암호화되어 평문이 요청 본문에 보이지 않는다', () => {
    const payload = JSON.stringify({
      type: 'alert',
      title: '현관 근처에서 움직임이 감지되었습니다',
    })
    const details = generateRequestDetails(subscription, payload, {
      vapidDetails: vapid,
      TTL: 3600,
      urgency: 'high',
    })
    const headers = details.headers as Record<string, string | number>
    expect(details.method).toBe('POST')
    expect(details.endpoint).toBe(subscription.endpoint)
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(String(headers.TTL)).toBe('3600')
    expect(headers.Urgency).toBe('high')
    expect(Buffer.isBuffer(details.body)).toBe(true)
    expect(details.body.includes(Buffer.from('현관'))).toBe(false)
    expect(details.body.toString('utf8')).not.toContain('type')
  })

  it('요청에 운영자 식별(VAPID) 서명이 붙는다', () => {
    const details = generateRequestDetails(subscription, '{}', { vapidDetails: vapid })
    const authorization = String((details.headers as Record<string, string>).Authorization ?? '')
    expect(authorization).toMatch(/^vapid t=.+, k=.+$/)
    expect(authorization).toContain(`k=${vapid.publicKey}`)
  })

  it('운영자 연락처 형식이 틀리면 라이브러리가 거부한다 (서버 시작 때 같은 규칙으로 먼저 막는다)', () => {
    expect(() =>
      generateRequestDetails(subscription, '{}', {
        vapidDetails: { ...vapid, subject: 'ops@example.com' },
      }),
    ).toThrow()
  })
})
