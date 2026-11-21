import type { AlertNotifyReason } from '@tetris/shared'
import { DELIVERY_MAX_ATTEMPTS, DELIVERY_RETRY_DELAYS_SECONDS } from '@/config/notifications'
import type { PrismaClient } from '@/db/client'
import type { Alert as AlertRow } from '@/generated/prisma/client'
import { DeliveryError, type NotificationChannelAdapter } from '@/integrations/notifications/types'
import type { RealtimeGateway } from '@/realtime/gateway'
import type { Logger } from '@/utils/logger'
import { type AlertPresenter, presentDelivery } from './alert-presenter'

/** 알림 한 건의 전달이 모두 끝났는데 아무에게도 전달되지 못했을 때 호출된다. */
type ExhaustedListener = (alert: AlertRow) => Promise<void>

/**
 * 알림 전달: 보호자 × 채널마다 전달 기록(NotificationDelivery)을 만들고 보낸다.
 *
 * - 실패하면 최대 3번(첫 시도 포함) 시도하고, 그래도 안 되면 FAILED 로 확정한다.
 * - 연동되지 않은 채널은 보낸 척하지 않고 NOT_CONFIGURED 로 기록한다.
 * - 시뮬레이션으로 만든 알림은 앱 밖으로 나가는 채널(문자 등)로 보내지 않는다.
 * - 알림이 이미 확인·종료되었으면 남은 재시도를 CANCELLED 로 멈춘다.
 * - 모든 보호자·채널 전달이 실패하면 호출자(AlertPipeline)가 "전달 실패" 알림을 만들도록 알린다.
 */
export class NotificationService {
  private readonly exhaustedListeners = new Set<ExhaustedListener>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapters: NotificationChannelAdapter[],
    private readonly gateway: RealtimeGateway,
    private readonly presenter: AlertPresenter,
    private readonly now: () => Date,
    private readonly logger: Logger,
  ) {
    if (DELIVERY_MAX_ATTEMPTS < 2) {
      // 첫 시도가 곧바로 최종 실패가 되면 알림 생성 중에 전달 실패 알림을 만들게 되어 순서가 꼬인다.
      throw new Error('DELIVERY_MAX_ATTEMPTS 는 2 이상이어야 합니다.')
    }
  }

  onAllDeliveriesFailed(listener: ExhaustedListener): () => void {
    this.exhaustedListeners.add(listener)
    return () => {
      this.exhaustedListeners.delete(listener)
    }
  }

  /** 가구의 모든 보호자에게 채널별로 알림을 보낸다. */
  async dispatch(alert: AlertRow, _reason: AlertNotifyReason): Promise<void> {
    const guardians = await this.prisma.guardian.findMany({
      where: { householdId: alert.householdId },
      select: { id: true },
    })
    const now = this.now()
    const pending: string[] = []

    for (const guardian of guardians) {
      for (const adapter of this.adapters) {
        if (adapter.external && alert.origin === 'SIMULATED') continue
        const mode = adapter.mode()
        const row = await this.prisma.notificationDelivery.create({
          data:
            mode === 'NOT_CONFIGURED'
              ? {
                  alertId: alert.id,
                  guardianId: guardian.id,
                  channel: adapter.channel,
                  status: 'NOT_CONFIGURED',
                  providerMode: null,
                }
              : {
                  alertId: alert.id,
                  guardianId: guardian.id,
                  channel: adapter.channel,
                  status: 'PENDING',
                  providerMode: mode,
                  nextAttemptAt: now,
                },
          include: { guardian: { select: { displayName: true } } },
        })
        if (mode === 'NOT_CONFIGURED') this.publish(alert, row)
        else pending.push(row.id)
      }
    }
    for (const id of pending) await this.attempt(id, _reason)
  }

  /** 다시 시도할 때가 된 전달을 시도한다. (주기 점검이 호출) */
  async retryDue(): Promise<number> {
    const due = await this.prisma.notificationDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: this.now() } },
      select: { id: true, alert: { select: { reminderCount: true } } },
    })
    for (const delivery of due) {
      await this.attempt(delivery.id, delivery.alert.reminderCount > 0 ? 'REMINDER' : 'NEW')
    }
    return due.length
  }

  private async attempt(deliveryId: string, reason: AlertNotifyReason): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { alert: true, guardian: { select: { id: true, displayName: true } } },
    })
    if (delivery?.status !== 'PENDING') return
    const { alert, guardian } = delivery

    if (alert.status !== 'OPEN') {
      const cancelled = await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'CANCELLED',
          nextAttemptAt: null,
          lastError: '알림이 확인되어 전달을 멈췄습니다.',
        },
        include: { guardian: { select: { displayName: true } } },
      })
      this.publish(alert, cancelled)
      return
    }

    const adapter = this.adapters.find((a) => a.channel === delivery.channel)
    const attempts = delivery.attempts + 1
    let error: string | null = null
    let retryable = true
    try {
      if (!adapter) throw new Error('채널 어댑터가 없습니다.')
      await adapter.send({ alert: await this.presenter.present(alert), reason }, guardian)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
      // 구독이 없거나 만료된 것처럼 다시 보내도 같은 실패는 시도 횟수를 채우지 않고 바로 확정한다.
      if (cause instanceof DeliveryError && !cause.retryable) retryable = false
      this.logger.warn(
        { alertId: alert.id, channel: delivery.channel, attempts, error },
        '알림 전달 실패',
      )
    }

    const exhausted = error !== null && (!retryable || attempts >= DELIVERY_MAX_ATTEMPTS)
    const delaySeconds =
      DELIVERY_RETRY_DELAYS_SECONDS[attempts - 1] ?? DELIVERY_RETRY_DELAYS_SECONDS.at(-1) ?? 60
    const updated = await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data:
        error === null
          ? { status: 'SENT', attempts, sentAt: this.now(), lastError: null, nextAttemptAt: null }
          : exhausted
            ? { status: 'FAILED', attempts, lastError: error, nextAttemptAt: null }
            : {
                status: 'PENDING',
                attempts,
                lastError: error,
                nextAttemptAt: new Date(this.now().getTime() + delaySeconds * 1000),
              },
      include: { guardian: { select: { displayName: true } } },
    })
    this.publish(alert, updated)
    if (exhausted) await this.checkAllFailed(alert.id)
  }

  /** 이 알림의 전달이 전부 끝났는데 아무에게도 전달되지 못했으면 알린다. */
  private async checkAllFailed(alertId: string): Promise<void> {
    const alert = await this.prisma.alert.findUnique({ where: { id: alertId } })
    // 전달 실패 알림 자체의 전달 실패로 또 알림을 만들면 끝이 없으므로 제외한다.
    if (!alert || alert.type === 'DELIVERY_FAILED') return
    const deliveries = await this.prisma.notificationDelivery.findMany({ where: { alertId } })
    const counted = deliveries.filter(
      (d) => d.status !== 'NOT_CONFIGURED' && d.status !== 'CANCELLED',
    )
    if (counted.length === 0 || counted.some((d) => d.status === 'SENT' || d.status === 'PENDING'))
      return
    for (const listener of this.exhaustedListeners) {
      try {
        await listener(alert)
      } catch (error) {
        this.logger.error({ err: error, alertId }, '전달 실패 알림 생성 실패')
      }
    }
  }

  private publish(alert: AlertRow, delivery: Parameters<typeof presentDelivery>[0]): void {
    this.gateway.emitToHousehold(alert.householdId, 'delivery.updated', {
      alertId: alert.id,
      delivery: presentDelivery(delivery),
    })
  }
}
