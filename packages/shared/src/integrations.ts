import { z } from './zod'
import { ChannelSchema, ProviderModeSchema, type Channel } from './domain'

/**
 * 외부 연동(알림 채널)이 지금 어떤 상태인지.
 * REAL: 실제 서비스와 연동됨 / MOCK: 가짜 응답으로 동작함 / NOT_CONFIGURED: 연동되지 않음
 */
export const INTEGRATION_MODES = ['REAL', 'MOCK', 'NOT_CONFIGURED'] as const
export const IntegrationModeSchema = z.enum(INTEGRATION_MODES)
export type IntegrationMode = z.infer<typeof IntegrationModeSchema>

export const INTEGRATION_MODE_LABELS: Record<IntegrationMode, string> = {
  REAL: '실제 연동',
  MOCK: '가짜 응답(테스트용)',
  NOT_CONFIGURED: '연동되지 않음',
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  IN_APP: '앱 화면 알림',
  WEB_PUSH: '브라우저 푸시',
  WATCH: '스마트워치',
  SMS: '문자 메시지',
  KAKAO: '카카오 알림톡',
}

export const IntegrationStatusSchema = z.object({
  key: ChannelSchema,
  mode: IntegrationModeSchema,
  /**
   * 이 채널로 마지막으로 전달에 성공한 시각(실제 알림 또는 테스트 발송). 성공한 적이 없으면 null.
   * 서버를 다시 시작하면 테스트 발송 기록은 사라지고 실제 알림 기록만 남는다.
   */
  lastSuccessAt: z.iso.datetime().nullable(),
})
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>

/** GET /api/system/integrations */
export const IntegrationsResponseSchema = z.object({
  integrations: z.array(IntegrationStatusSchema),
})
export type IntegrationsResponse = z.infer<typeof IntegrationsResponseSchema>

// ───────── 브라우저 푸시 (Web Push) ─────────

/** GET /api/push/config — 서버에 VAPID 키가 설정되어 있어야 푸시를 쓸 수 있다. */
export const PushConfigResponseSchema = z.object({
  configured: z.boolean(),
  /** 브라우저가 구독할 때 쓰는 공개 키. 설정되지 않았으면 null */
  publicKey: z.string().nullable(),
})
export type PushConfigResponse = z.infer<typeof PushConfigResponseSchema>

/** 브라우저의 PushSubscription.toJSON() 에서 서버가 필요한 부분 */
export const PushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>

export const PushSubscriptionSummarySchema = z.object({
  id: z.string(),
  /** 푸시 서비스 주소의 호스트(예: fcm.googleapis.com). 전체 주소는 보여 주지 않는다. */
  host: z.string(),
  createdAt: z.iso.datetime(),
})
export type PushSubscriptionSummary = z.infer<typeof PushSubscriptionSummarySchema>

export const PushSubscriptionsResponseSchema = z.object({
  subscriptions: z.array(PushSubscriptionSummarySchema),
})
export type PushSubscriptionsResponse = z.infer<typeof PushSubscriptionsResponseSchema>

export const PushSubscribeResponseSchema = z.object({ subscription: PushSubscriptionSummarySchema })
export type PushSubscribeResponse = z.infer<typeof PushSubscribeResponseSchema>

// ───────── 알림 채널 테스트 발송 (POST /api/notifications/test) ─────────

// ───────── 알림 채널 지원 현황 (GET /api/system/channel-support) ─────────

export const WATCH_PLATFORM_IDS = ['APPLE_WATCH', 'WEAR_OS'] as const

export const ChannelSupportItemSchema = z.object({
  key: ChannelSchema,
  /** 서버가 이 채널로 실제 전달할 수 있는가. 구현되지 않았으면 false 이며 "동작함"으로 표시하지 않는다. */
  implemented: z.boolean(),
  note: z.string().nullable(),
})
export const WatchPlatformSupportSchema = z.object({
  platform: z.enum(WATCH_PLATFORM_IDS),
  label: z.string(),
  deliverable: z.boolean(),
  /** 이 플랫폼에 전달하려면 새로 만들어야 하는 것 */
  requires: z.array(z.string()),
})
export const ChannelSupportResponseSchema = z.object({
  channels: z.array(ChannelSupportItemSchema),
  watchPlatforms: z.array(WatchPlatformSupportSchema),
})
export type ChannelSupportResponse = z.infer<typeof ChannelSupportResponseSchema>

export const ChannelTestRequestSchema = z.object({ channel: ChannelSchema })
export type ChannelTestRequest = z.infer<typeof ChannelTestRequestSchema>

export const ChannelTestResponseSchema = z.object({
  channel: ChannelSchema,
  /** SENT: 전달됨 / FAILED: 실패(이유는 error) / NOT_CONFIGURED: 연동되지 않아 보내지 않음 */
  status: z.enum(['SENT', 'FAILED', 'NOT_CONFIGURED']),
  mode: ProviderModeSchema.nullable(),
  error: z.string().nullable(),
  testedAt: z.iso.datetime(),
})
export type ChannelTestResponse = z.infer<typeof ChannelTestResponseSchema>
