import {
  type Channel,
  type ChannelSupportResponse,
  type ChannelTestResponse,
  type IntegrationsResponse,
} from '@tetris/shared'
import { WATCH_PLATFORM_SUPPORT } from '@/integrations/notifications/watch.adapter'
import type { PrismaClient } from '@/db/client'
import { DeliveryError, type NotificationChannelAdapter } from '@/integrations/notifications/types'
import { AppError } from '@/utils/errors'

/** 같은 채널을 이어서 테스트할 수 있는 최소 간격 */
const TEST_COOLDOWN_MS = 5_000

/**
 * 알림 채널 현황과 테스트 발송.
 * 현황은 각 채널 어댑터가 스스로 밝히는 상태(REAL / MOCK / NOT_CONFIGURED)를 그대로 보여 준다.
 */
export class ChannelService {
  /** 테스트 발송 성공 시각. 서버를 다시 시작하면 사라진다. (실제 알림의 전달 기록은 DB 에 남는다) */
  private readonly testSuccess = new Map<string, Date>()
  private readonly lastTestAt = new Map<string, number>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapters: readonly NotificationChannelAdapter[],
    private readonly now: () => Date,
  ) {}

  async integrations(householdId: string): Promise<IntegrationsResponse> {
    const integrations = await Promise.all(
      this.adapters.map(async (adapter) => ({
        key: adapter.channel,
        mode: adapter.mode(),
        lastSuccessAt:
          (await this.lastSuccess(householdId, adapter.channel))?.toISOString() ?? null,
      })),
    )
    return { integrations }
  }

  /** 채널별 지원 여부와 스마트워치 플랫폼별로 아직 필요한 작업. (설정 화면·문서가 구현된 것과 아닌 것을 구별한다) */
  support(): ChannelSupportResponse {
    return {
      channels: this.adapters.map((adapter) => {
        const support = adapter.support?.() ?? {
          implemented: adapter.mode() !== 'NOT_CONFIGURED',
          note: adapter.mode() === 'NOT_CONFIGURED' ? '연동되어 있지 않습니다.' : null,
        }
        return { key: adapter.channel, ...support }
      }),
      watchPlatforms: WATCH_PLATFORM_SUPPORT.map((p) => ({ ...p, requires: [...p.requires] })),
    }
  }

  /** 지금 로그인한 보호자에게 테스트를 보낸다. 알림(Alert)이나 전달 기록은 만들지 않는다. */
  async test(
    guardian: { id: string; householdId: string },
    channel: Channel,
  ): Promise<ChannelTestResponse> {
    const adapter = this.adapters.find((a) => a.channel === channel)
    if (!adapter) throw AppError.notFound('알림 채널을 찾을 수 없습니다.')

    const key = `${guardian.id}:${channel}`
    const nowMs = this.now().getTime()
    const last = this.lastTestAt.get(key)
    if (last !== undefined && nowMs - last < TEST_COOLDOWN_MS) {
      throw AppError.rateLimited(
        '테스트를 너무 자주 보내고 있습니다. 잠시 후 다시 시도해 주세요.',
        5,
      )
    }
    this.lastTestAt.set(key, nowMs)

    const testedAt = this.now().toISOString()
    const mode = adapter.mode()
    // 연동되지 않은 채널은 보낸 척하지 않고 그대로 알린다.
    if (mode === 'NOT_CONFIGURED') {
      return { channel, status: 'NOT_CONFIGURED', mode: null, error: null, testedAt }
    }

    const row = await this.prisma.guardian.findFirst({
      where: { id: guardian.id, householdId: guardian.householdId },
      select: { id: true, displayName: true },
    })
    if (!row) throw AppError.unauthorized()

    try {
      await adapter.sendTest({ id: row.id, displayName: row.displayName })
      this.testSuccess.set(`${guardian.householdId}:${channel}`, this.now())
      return { channel, status: 'SENT', mode, error: null, testedAt }
    } catch (error) {
      if (error instanceof DeliveryError) {
        return { channel, status: 'FAILED', mode, error: error.message, testedAt }
      }
      throw error
    }
  }

  private async lastSuccess(householdId: string, channel: Channel): Promise<Date | null> {
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { channel, status: 'SENT', alert: { householdId } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    })
    const test = this.testSuccess.get(`${householdId}:${channel}`) ?? null
    const times = [delivery?.sentAt ?? null, test].filter((t): t is Date => t !== null)
    return times.length === 0 ? null : new Date(Math.max(...times.map((t) => t.getTime())))
  }
}
