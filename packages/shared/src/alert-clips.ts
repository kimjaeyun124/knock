import { z } from './zod'

/**
 * 알림에 붙는 짧은 영상(시연용 웹캠). 영상은 개인정보이므로 크기·개수·보관 기간을 제한한다.
 * - 알림이 새로 만들어졌을 때만 붙인다. 알림이 되지 않은 움직임의 영상은 어디에도 저장하지 않는다.
 * - 보관 기간이 지나면 주기 점검이 지운다. 알림이 지워지면 함께 지워진다.
 */
export const ALERT_CLIP_LIMITS = {
  /** 녹화 길이 (움직임이 확정된 순간부터) */
  recordMs: 4000,
  /** 영상 하나의 최대 크기 */
  maxBytes: 6 * 1024 * 1024,
  /** 알림 하나에 붙일 수 있는 최대 개수 */
  maxPerAlert: 5,
  /** 보관 기간(일) */
  retentionDays: 7,
  mimeTypes: ['video/webm', 'video/mp4'] as const,
} as const

export const AlertClipMimeTypeSchema = z.enum(ALERT_CLIP_LIMITS.mimeTypes)
export type AlertClipMimeType = z.infer<typeof AlertClipMimeTypeSchema>

export const AlertClipSchema = z.object({
  id: z.string(),
  alertId: z.string(),
  mimeType: AlertClipMimeTypeSchema,
  sizeBytes: z.number().int().min(1),
  durationMs: z.number().int().min(0).nullable(),
  createdAt: z.iso.datetime(),
  /** 재생 주소 (같은 출처, 로그인 필요) */
  url: z.string(),
})
export type AlertClip = z.infer<typeof AlertClipSchema>

/** GET /api/alerts/:id/clips */
export const AlertClipsResponseSchema = z.object({ clips: z.array(AlertClipSchema) })
export type AlertClipsResponse = z.infer<typeof AlertClipsResponseSchema>

/** POST /api/dev/simulator/alerts/:id/clips 응답 */
export const AlertClipUploadResponseSchema = z.object({ clip: AlertClipSchema })
export type AlertClipUploadResponse = z.infer<typeof AlertClipUploadResponseSchema>
