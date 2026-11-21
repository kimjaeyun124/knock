import { describe, expect, it } from 'vitest'
import { CHANNELS } from './domain'
import {
  ChannelTestResponseSchema,
  PushSubscriptionInputSchema,
  CHANNEL_LABELS,
  INTEGRATION_MODES,
  INTEGRATION_MODE_LABELS,
  IntegrationsResponseSchema,
} from './integrations'

describe('연동 현황 계약', () => {
  it('실제·가짜·미연동을 구분해서 받는다', () => {
    const parsed = IntegrationsResponseSchema.parse({
      integrations: [
        { key: 'IN_APP', mode: 'REAL', lastSuccessAt: '2026-11-14T00:00:00.000Z' },
        { key: 'SMS', mode: 'MOCK', lastSuccessAt: null },
        { key: 'KAKAO', mode: 'NOT_CONFIGURED', lastSuccessAt: null },
      ],
    })
    expect(parsed.integrations.map((i) => i.mode)).toEqual(['REAL', 'MOCK', 'NOT_CONFIGURED'])
  })

  it('알 수 없는 방식이나 채널은 거부한다', () => {
    expect(
      IntegrationsResponseSchema.safeParse({
        integrations: [{ key: 'IN_APP', mode: 'ENABLED', lastSuccessAt: null }],
      }).success,
    ).toBe(false)
    expect(
      IntegrationsResponseSchema.safeParse({
        integrations: [{ key: 'FAX', mode: 'REAL', lastSuccessAt: null }],
      }).success,
    ).toBe(false)
  })

  it('모든 방식과 채널에 화면용 이름이 있다', () => {
    for (const mode of INTEGRATION_MODES) expect(INTEGRATION_MODE_LABELS[mode]).toBeTruthy()
    for (const channel of CHANNELS) expect(CHANNEL_LABELS[channel]).toBeTruthy()
  })

  it('푸시 구독은 https 주소와 키를 요구한다', () => {
    const keys = { p256dh: 'BKey', auth: 'authSecret' }
    expect(
      PushSubscriptionInputSchema.safeParse({ endpoint: 'https://push.example.com/x', keys })
        .success,
    ).toBe(true)
    expect(PushSubscriptionInputSchema.safeParse({ endpoint: 'not a url', keys }).success).toBe(
      false,
    )
    expect(
      PushSubscriptionInputSchema.safeParse({
        endpoint: 'https://push.example.com/x',
        keys: { p256dh: '', auth: 'a' },
      }).success,
    ).toBe(false)
  })

  it('테스트 발송 결과는 세 가지 상태만 가진다', () => {
    const base = { channel: 'SMS', mode: null, error: null, testedAt: '2026-11-14T00:00:00.000Z' }
    for (const status of ['SENT', 'FAILED', 'NOT_CONFIGURED']) {
      expect(ChannelTestResponseSchema.safeParse({ ...base, status }).success).toBe(true)
    }
    expect(ChannelTestResponseSchema.safeParse({ ...base, status: 'OK' }).success).toBe(false)
  })
})
