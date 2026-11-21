import type {
  PushConfigResponse,
  PushSubscriptionInput,
  PushSubscriptionSummary,
} from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { isSafePushEndpoint } from '@/integrations/notifications/push-endpoint'
import { AppError } from '@/utils/errors'

/** 보호자 한 명이 등록할 수 있는 기기 수 */
export const MAX_PUSH_SUBSCRIPTIONS_PER_GUARDIAN = 10

function summarize(row: {
  id: string
  endpoint: string
  createdAt: Date
}): PushSubscriptionSummary {
  return {
    id: row.id,
    host: new URL(row.endpoint).hostname,
    createdAt: row.createdAt.toISOString(),
  }
}

/** 브라우저 푸시를 받을 기기 등록. 모든 조회·수정은 로그인한 보호자 본인의 것으로만 한정된다. */
export class PushService {
  constructor(
    private readonly prisma: PrismaClient,
    /** VAPID 공개 키. 설정되지 않았으면 null (푸시 사용 불가) */
    private readonly publicKey: string | null,
  ) {}

  config(): PushConfigResponse {
    return { configured: this.publicKey !== null, publicKey: this.publicKey }
  }

  async list(guardianId: string): Promise<PushSubscriptionSummary[]> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { guardianId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(summarize)
  }

  /** 같은 브라우저가 다시 등록하면 새 항목을 만들지 않고 키를 갱신한다. */
  async subscribe(
    guardianId: string,
    input: PushSubscriptionInput,
  ): Promise<PushSubscriptionSummary> {
    if (this.publicKey === null) {
      throw AppError.conflict('이 서버에는 브라우저 푸시가 설정되어 있지 않습니다.')
    }
    if (!isSafePushEndpoint(input.endpoint)) {
      throw AppError.badRequest('푸시 서비스 주소가 올바르지 않습니다.')
    }
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
    })
    if (!existing) {
      const count = await this.prisma.pushSubscription.count({ where: { guardianId } })
      if (count >= MAX_PUSH_SUBSCRIPTIONS_PER_GUARDIAN) {
        throw AppError.conflict(
          `푸시를 받을 기기는 최대 ${MAX_PUSH_SUBSCRIPTIONS_PER_GUARDIAN}개까지 등록할 수 있습니다.`,
        )
      }
    }
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        guardianId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      // 같은 브라우저를 다른 보호자가 쓰게 되면 지금 로그인한 보호자 것으로 옮긴다.
      update: { guardianId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    })
    return summarize(row)
  }

  async remove(guardianId: string, id: string): Promise<void> {
    const result = await this.prisma.pushSubscription.deleteMany({ where: { id, guardianId } })
    if (result.count === 0) throw AppError.notFound('등록된 기기를 찾을 수 없습니다.')
  }
}
