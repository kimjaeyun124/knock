import { z } from './zod'

/**
 * GET /api/health 응답. 서버가 응답을 만들 때와 웹이 받을 때 모두 이 스키마로 검증한다.
 * 점검 항목 중 하나라도 실패하면 서버는 이 응답 대신 503 오류(SERVICE_UNAVAILABLE)를 돌려준다.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    database: z.literal('up'),
  }),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>
