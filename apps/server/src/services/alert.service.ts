import {
  IMPORTANT_SEVERITIES,
  severityRank,
  type Alert,
  type AlertDetail,
  type AlertItem,
  type AlertListResponse,
  type AlertReadAllResponse,
  type AlertResolveRequest,
  type AlertUnreadCountResponse,
  type AlertsQuerySchema,
} from '@tetris/shared'
import type { z } from 'zod'
import { REMINDER_MAX_COUNT } from '@/config/notifications'
import type { PrismaClient } from '@/db/client'
import type { AlertCandidate } from '@/domain/rules/types'
import type { Alert as AlertRow, Prisma } from '@/generated/prisma/client'
import type { RealtimeGateway } from '@/realtime/gateway'
import { decodeCursor, encodeCursor } from '@/utils/cursor'
import { AppError } from '@/utils/errors'
import { KeyedQueue } from '@/utils/keyed-queue'
import { type AlertPresenter, presentDelivery } from './alert-presenter'
import type { NotificationService } from './notification.service'
import type { SettingsService } from './settings.service'

export type AlertsFilter = z.output<typeof AlertsQuerySchema>

export type RaiseAction = 'created' | 'merged' | 'escalated' | 'unchanged'

const NOT_FOUND = '알림을 찾을 수 없습니다.'

/**
 * 알림 수명주기: 만들기 → 합치기(반복 억제) → 에스컬레이션 → 확인 → 종료, 그리고 재알림.
 *
 * 같은 가구의 변경은 KeyedQueue 로 한 번에 하나씩 처리한다. (센서 신호가 동시에 들어와도
 * 같은 알림이 두 번 생기지 않고, 보호자의 "확인"이 서버의 병합 갱신에 덮어써지지 않는다.)
 *
 * 합치기 규칙
 * - EVENT 알림: 같은 종류가 아직 종료되지 않았고 마지막 신호로부터 반복 억제 시간(cooldown) 안이면
 *   새로 만들지 않고 근거 신호만 더한다. 시간이 지났거나 보호자가 종료했다면 새 알림을 만든다.
 * - CONDITION 알림(연결 끊김·배터리): 상태가 풀릴 때까지 종류(센서)당 알림 하나만 유지한다.
 * - 심각도가 더 높은 후보가 합쳐지면 알림을 격상시키고 다시 알린다. (예: 배터리 부족 → 위급)
 */
export class AlertService {
  private readonly queue = new KeyedQueue()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationService,
    private readonly presenter: AlertPresenter,
    private readonly gateway: RealtimeGateway,
    private readonly now: () => Date,
  ) {}

  raise(
    householdId: string,
    candidate: AlertCandidate,
  ): Promise<{ alert: AlertRow; action: RaiseAction }> {
    return this.queue.run(householdId, async () => {
      const now = this.now()
      const rules = await this.settings.getRules(householdId)
      // 실제 알림과 시뮬레이션 알림은 같은 종류라도 합치지 않는다. (출처가 섞이면 시뮬레이션 삭제가 실제 기록을 건드린다)
      const existing = await this.prisma.alert.findFirst({
        where: {
          householdId,
          origin: candidate.origin,
          dedupeKey: candidate.dedupeKey,
          status: { not: 'RESOLVED' },
        },
        orderBy: { lastEventAt: 'desc' },
      })
      const withinCooldown =
        existing !== null &&
        candidate.lastEventAt.getTime() - existing.lastEventAt.getTime() <
          rules.cooldownMinutes * 60_000
      if (existing && (candidate.mode === 'CONDITION' || withinCooldown)) {
        return this.merge(existing, candidate, now)
      }
      return this.create(householdId, candidate, now)
    })
  }

  private async create(
    householdId: string,
    candidate: AlertCandidate,
    now: Date,
  ): Promise<{ alert: AlertRow; action: RaiseAction }> {
    const alert = await this.prisma.alert.create({
      data: {
        householdId,
        type: candidate.type,
        severity: candidate.severity,
        status: candidate.resolved ? 'RESOLVED' : 'OPEN',
        ...(candidate.resolved ? { resolution: 'AUTO_RESOLVED' as const, resolvedAt: now } : {}),
        origin: candidate.origin,
        title: candidate.title,
        message: candidate.message,
        sensorId: candidate.sensorId,
        triggeredAt: candidate.triggeredAt,
        lastEventAt: candidate.lastEventAt,
        occurrences: Math.max(1, candidate.evidenceEventIds.length),
        dedupeKey: candidate.dedupeKey,
        lastNotifiedAt: now,
        evidence: { create: candidate.evidenceEventIds.map((eventId) => ({ eventId })) },
      },
    })
    this.gateway.emitToHousehold(householdId, 'alert.created', {
      alert: await this.presenter.present(alert),
    })
    await this.notifyIfNeeded(alert, 'NEW')
    return { alert, action: 'created' }
  }

  private async merge(
    existing: AlertRow,
    candidate: AlertCandidate,
    now: Date,
  ): Promise<{ alert: AlertRow; action: RaiseAction }> {
    const known = new Set(
      (
        await this.prisma.alertEvidence.findMany({
          where: { alertId: existing.id },
          select: { eventId: true },
        })
      ).map((e) => e.eventId),
    )
    const added = candidate.evidenceEventIds.filter((id) => !known.has(id))
    const escalate = severityRank(candidate.severity) > severityRank(existing.severity)
    const lastEventAt =
      candidate.lastEventAt.getTime() > existing.lastEventAt.getTime()
        ? candidate.lastEventAt
        : existing.lastEventAt

    // 연결 끊김·배터리처럼 상태에서 생긴 알림은 주기 점검마다 같은 후보가 다시 올라오므로,
    // 새 근거나 심각도 변화가 없으면 아무것도 바꾸지 않고 화면에도 다시 보내지 않는다.
    const nothingNew =
      added.length === 0 &&
      !escalate &&
      (candidate.mode === 'CONDITION' || lastEventAt === existing.lastEventAt)
    if (nothingNew) return { alert: existing, action: 'unchanged' }

    if (added.length > 0) {
      await this.prisma.alertEvidence.createMany({
        data: added.map((eventId) => ({ alertId: existing.id, eventId })),
      })
    }
    const data: Prisma.AlertUpdateInput = {
      lastEventAt,
      ...(added.length > 0 ? { occurrences: { increment: added.length } } : {}),
      ...(escalate
        ? {
            severity: candidate.severity,
            title: candidate.title,
            message: candidate.message,
            // 더 심각해졌으므로 이전에 확인했더라도 다시 확인이 필요하다.
            status: 'OPEN',
            acknowledgedAt: null,
            acknowledgedById: null,
            lastNotifiedAt: now,
            reminderCount: 0,
          }
        : {}),
    }
    const alert = await this.prisma.alert.update({ where: { id: existing.id }, data })
    this.gateway.emitToHousehold(alert.householdId, 'alert.updated', {
      alert: await this.presenter.present(alert),
    })
    if (escalate) await this.notifyIfNeeded(alert, 'ESCALATED')
    return { alert, action: escalate ? 'escalated' : 'merged' }
  }

  /** 정보(INFO) 수준 알림은 목록에만 올리고 별도 알림을 보내지 않는다. */
  private async notifyIfNeeded(
    alert: AlertRow,
    reason: 'NEW' | 'ESCALATED' | 'REMINDER',
  ): Promise<void> {
    if (alert.severity === 'INFO') return
    await this.notifications.dispatch(alert, reason)
  }

  async acknowledge(householdId: string, alertId: string, guardianId: string): Promise<AlertItem> {
    return this.queue.run(householdId, async () => {
      const alert = await this.findOwned(householdId, alertId)
      if (alert.status === 'RESOLVED') throw AppError.conflict('이미 종료된 알림입니다.')
      if (alert.status === 'ACKNOWLEDGED') return this.item(alert, guardianId) // 같은 결과를 보장
      const updated = await this.prisma.alert.update({
        where: { id: alertId },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: this.now(), acknowledgedById: guardianId },
      })
      await this.publishUpdated(updated)
      return this.item(updated, guardianId)
    })
  }

  async resolve(
    householdId: string,
    alertId: string,
    guardianId: string,
    input: AlertResolveRequest,
  ): Promise<AlertItem> {
    return this.queue.run(householdId, async () => {
      const alert = await this.findOwned(householdId, alertId)
      if (alert.status === 'RESOLVED') throw AppError.conflict('이미 종료된 알림입니다.')
      const now = this.now()
      const updated = await this.prisma.alert.update({
        where: { id: alertId },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
          resolution: input.resolution,
          note: input.note ? input.note : null,
          acknowledgedAt: alert.acknowledgedAt ?? now,
          acknowledgedById: alert.acknowledgedById ?? guardianId,
        },
      })
      await this.publishUpdated(updated)
      return this.item(updated, guardianId)
    })
  }

  /** 조건이 해소된 알림(센서 연결 복구 등)을 시스템이 종료한다. */
  autoResolve(householdId: string, alertId: string): Promise<void> {
    return this.queue.run(householdId, async () => {
      const alert = await this.prisma.alert.findFirst({ where: { id: alertId, householdId } })
      if (!alert || alert.status === 'RESOLVED') return
      const now = this.now()
      const updated = await this.prisma.alert.update({
        where: { id: alertId },
        data: { status: 'RESOLVED', resolution: 'AUTO_RESOLVED', resolvedAt: now },
      })
      await this.publishUpdated(updated)
    })
  }

  /** 확인하지 않은 긴급 알림을 다시 알린다. (반복 간격은 가구 설정 reminderMinutes, 최대 3번) */
  async sendDueReminders(): Promise<number> {
    const now = this.now()
    const candidates = await this.prisma.alert.findMany({
      where: { severity: 'URGENT', status: 'OPEN', reminderCount: { lt: REMINDER_MAX_COUNT } },
    })
    let sent = 0
    for (const candidate of candidates) {
      const rules = await this.settings.getRules(candidate.householdId)
      if (now.getTime() - candidate.lastNotifiedAt.getTime() < rules.reminderMinutes * 60_000)
        continue
      sent += await this.queue.run(candidate.householdId, async () => {
        // 큐를 기다리는 사이 확인·종료되었을 수 있으므로 다시 읽어 확인한다.
        const fresh = await this.prisma.alert.findUnique({ where: { id: candidate.id } })
        if (fresh?.status !== 'OPEN' || fresh.reminderCount >= REMINDER_MAX_COUNT) return 0
        const updated = await this.prisma.alert.update({
          where: { id: fresh.id },
          data: { reminderCount: { increment: 1 }, lastNotifiedAt: now },
        })
        await this.publishUpdated(updated)
        await this.notifications.dispatch(updated, 'REMINDER')
        return 1
      })
    }
    return sent
  }

  async list(
    householdId: string,
    guardianId: string,
    filter: AlertsFilter,
  ): Promise<AlertListResponse> {
    const cursor = filter.cursor ? decodeCursor(filter.cursor) : undefined
    const where: Prisma.AlertWhereInput = {
      householdId,
      ...(filter.status ? { status: { in: filter.status } } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.origin ? { origin: filter.origin } : {}),
      // 읽지 않음: 이 보호자가 읽음 처리하지 않은 알림. 처리 상태(확인·종료)와는 상관없다.
      ...(filter.unread ? { reads: { none: { guardianId } } } : {}),
      ...(filter.important ? { severity: { in: [...IMPORTANT_SEVERITIES] } } : {}),
      ...(cursor
        ? {
            OR: [
              { triggeredAt: { lt: new Date(cursor.atMs) } },
              { triggeredAt: new Date(cursor.atMs), id: { lt: cursor.id } },
            ],
          }
        : {}),
    }
    const rows = await this.prisma.alert.findMany({
      where,
      orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    })
    const page = rows.slice(0, filter.limit)
    const last = page.at(-1)
    return {
      alerts: await this.presenter.presentItems(page, guardianId),
      nextCursor:
        rows.length > filter.limit && last
          ? encodeCursor({ atMs: last.triggeredAt.getTime(), id: last.id })
          : null,
    }
  }

  async get(householdId: string, guardianId: string, alertId: string): Promise<AlertDetail> {
    const alert = await this.findOwned(householdId, alertId)
    const [evidence, deliveries] = await Promise.all([
      this.prisma.alertEvidence.findMany({
        where: { alertId },
        include: { event: { include: { sensor: { select: { name: true } } } } },
      }),
      this.prisma.notificationDelivery.findMany({
        where: { alertId },
        orderBy: { createdAt: 'asc' },
        include: { guardian: { select: { displayName: true } } },
      }),
    ])
    return {
      alert: await this.item(alert, guardianId),
      evidence: evidence
        .map((e) => e.event)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .map((event) => ({
          eventId: event.id,
          sensorName: event.sensor.name,
          zone: event.zone,
          occurredAt: event.occurredAt.toISOString(),
          isLate: event.isLate,
        })),
      deliveries: deliveries.map(presentDelivery),
    }
  }

  /**
   * 내가 읽지 않은 알림 수. 처리 상태(진행 중·확인함·종료)와 상관없이 센다.
   * 읽음은 "봤다"는 표시일 뿐이라, 읽지 않은 수가 0이어도 해결되지 않은 알림이 있을 수 있다.
   */
  async unreadCount(householdId: string, guardianId: string): Promise<AlertUnreadCountResponse> {
    const unread: Prisma.AlertWhereInput = { householdId, reads: { none: { guardianId } } }
    const [total, important] = await Promise.all([
      this.prisma.alert.count({ where: unread }),
      this.prisma.alert.count({
        where: { ...unread, severity: { in: [...IMPORTANT_SEVERITIES] } },
      }),
    ])
    return { unread: total, unreadImportant: important }
  }

  /** 알림 하나를 읽음으로 표시한다. 이미 읽은 알림이면 아무것도 바꾸지 않는다. (처리 상태는 건드리지 않는다) */
  async markRead(householdId: string, guardianId: string, alertId: string): Promise<AlertItem> {
    const alert = await this.findOwned(householdId, alertId)
    const existing = await this.prisma.alertRead.findUnique({
      where: { alertId_guardianId: { alertId, guardianId } },
    })
    if (!existing) {
      // 동시에 두 번 눌러도 한 번만 기록되도록 이미 있으면 건너뛴다.
      await this.prisma.alertRead.createMany({ data: [{ alertId, guardianId }] })
      await this.gateway.emitToGuardian(guardianId, 'alert.read', {
        alertIds: [alertId],
        all: false,
      })
    }
    return this.item(alert, guardianId)
  }

  /** 지금까지의 모든 알림을 읽음으로 표시한다. 처리 상태는 건드리지 않는다. */
  async markAllRead(householdId: string, guardianId: string): Promise<AlertReadAllResponse> {
    const unread = await this.prisma.alert.findMany({
      where: { householdId, reads: { none: { guardianId } } },
      select: { id: true },
    })
    if (unread.length === 0) return { updated: 0 }
    await this.prisma.alertRead.createMany({
      data: unread.map((alert) => ({ alertId: alert.id, guardianId })),
    })
    await this.gateway.emitToGuardian(guardianId, 'alert.read', { alertIds: [], all: true })
    return { updated: unread.length }
  }

  private async item(alert: AlertRow, guardianId: string): Promise<AlertItem> {
    const [item] = await this.presenter.presentItems([alert], guardianId)
    if (!item) throw new Error('알림 변환에 실패했습니다.')
    return item
  }

  private async findOwned(householdId: string, alertId: string): Promise<AlertRow> {
    const alert = await this.prisma.alert.findFirst({ where: { id: alertId, householdId } })
    if (!alert) throw AppError.notFound(NOT_FOUND)
    return alert
  }

  private async publishUpdated(alert: AlertRow): Promise<Alert> {
    const dto = await this.presenter.present(alert)
    this.gateway.emitToHousehold(alert.householdId, 'alert.updated', { alert: dto })
    return dto
  }
}
