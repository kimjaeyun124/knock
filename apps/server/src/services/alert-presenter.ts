import {
  aggregateDeliveryState,
  classifyDelivery,
  type Alert,
  type AlertDelivery,
  type AlertItem,
  type AlertType,
  type DeliverySummary,
  type SensorStatusLogKind,
} from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { MOVEMENT_PREFIX, STATUS_PREFIX, STATUS_ALERT_LINK_WINDOW_MS } from '@/domain/timeline'
import type {
  Alert as AlertRow,
  NotificationDelivery as DeliveryRow,
} from '@/generated/prisma/client'

export type DeliveryWithGuardian = DeliveryRow & { guardian: { displayName: string } }

/** 알림 하나에 붙여 보여 주는 관련 움직임 기록 ID 의 최대 개수 */
const RELATED_EVENT_LIMIT = 5

/** 센서 알림이 가리키는 센서 상태 이력의 종류 */
const STATUS_KINDS: Partial<Record<AlertType, SensorStatusLogKind[]>> = {
  SENSOR_OFFLINE: ['DISCONNECTED'],
  SENSOR_RESTORED: ['CONNECTED'],
  LOW_BATTERY: ['BATTERY_LOW', 'BATTERY_CRITICAL'],
}

export function presentDelivery(row: DeliveryWithGuardian): AlertDelivery {
  return {
    id: row.id,
    guardianId: row.guardianId,
    guardianName: row.guardian.displayName,
    channel: row.channel,
    providerMode: row.providerMode,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** 알림 행을 화면용 DTO 로 바꾼다. (센서 이름·확인한 사람·전달 요약·관련 기록을 한꺼번에 조회해 붙인다) */
export class AlertPresenter {
  constructor(private readonly prisma: PrismaClient) {}

  async present(row: AlertRow): Promise<Alert> {
    const [alert] = await this.presentMany([row])
    if (!alert) throw new Error('알림 변환에 실패했습니다.')
    return alert
  }

  /**
   * 읽는 보호자 기준으로 읽음 여부를 붙인다.
   * (읽음은 보호자마다 다르므로, 모든 화면에 뿌리는 실시간 알림에는 붙이지 않는다)
   */
  async presentItems(rows: AlertRow[], guardianId: string): Promise<AlertItem[]> {
    const alerts = await this.presentMany(rows)
    if (alerts.length === 0) return []
    const reads = await this.prisma.alertRead.findMany({
      where: { guardianId, alertId: { in: alerts.map((alert) => alert.id) } },
      select: { alertId: true },
    })
    const readIds = new Set(reads.map((read) => read.alertId))
    return alerts.map((alert) => ({ ...alert, read: readIds.has(alert.id) }))
  }

  async presentMany(rows: AlertRow[]): Promise<Alert[]> {
    if (rows.length === 0) return []
    const alertIds = rows.map((r) => r.id)
    const sensorIds = [...new Set(rows.map((r) => r.sensorId).filter((id): id is string => !!id))]
    const guardianIds = [
      ...new Set(rows.map((r) => r.acknowledgedById).filter((id): id is string => !!id)),
    ]
    const [sensors, guardians, deliveries, evidence] = await Promise.all([
      this.prisma.sensor.findMany({
        where: { id: { in: sensorIds } },
        select: { id: true, name: true },
      }),
      this.prisma.guardian.findMany({
        where: { id: { in: guardianIds } },
        select: { id: true, displayName: true },
      }),
      this.prisma.notificationDelivery.findMany({
        where: { alertId: { in: alertIds } },
        select: { alertId: true, status: true, channel: true, attempts: true },
      }),
      this.prisma.alertEvidence.findMany({
        where: { alertId: { in: alertIds } },
        select: { alertId: true, event: { select: { id: true, occurredAt: true } } },
      }),
    ])
    const statusLinks = await this.statusEventIds(rows)

    const sensorNames = new Map(sensors.map((s) => [s.id, s.name]))
    const guardianNames = new Map(guardians.map((g) => [g.id, g.displayName]))
    const summaries = new Map<string, DeliverySummary>()
    const states = new Map<string, ReturnType<typeof classifyDelivery>[]>()
    for (const d of deliveries) {
      const summary = summaries.get(d.alertId) ?? {
        sent: 0,
        pending: 0,
        failed: 0,
        notConfigured: 0,
      }
      if (d.status === 'SENT') summary.sent += 1
      else if (d.status === 'PENDING') summary.pending += 1
      else if (d.status === 'FAILED') summary.failed += 1
      else if (d.status === 'NOT_CONFIGURED') summary.notConfigured += 1
      summaries.set(d.alertId, summary)
      states.set(d.alertId, [...(states.get(d.alertId) ?? []), classifyDelivery(d)])
    }
    // 근거가 된 움직임 신호: 최신 것부터 최대 RELATED_EVENT_LIMIT 개
    const evidenceByAlert = new Map<string, { id: string; at: number }[]>()
    for (const item of evidence) {
      const list = evidenceByAlert.get(item.alertId) ?? []
      list.push({ id: item.event.id, at: item.event.occurredAt.getTime() })
      evidenceByAlert.set(item.alertId, list)
    }

    return rows.map((row) => {
      const movement = (evidenceByAlert.get(row.id) ?? [])
        .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))
        .slice(0, RELATED_EVENT_LIMIT)
        .map((item) => `${MOVEMENT_PREFIX}${item.id}`)
      const status = statusLinks.get(row.id)
      return {
        id: row.id,
        type: row.type,
        severity: row.severity,
        status: row.status,
        origin: row.origin,
        title: row.title,
        message: row.message,
        sensorId: row.sensorId,
        sensorName: row.sensorId ? (sensorNames.get(row.sensorId) ?? null) : null,
        triggeredAt: row.triggeredAt.toISOString(),
        lastEventAt: row.lastEventAt.toISOString(),
        occurrences: row.occurrences,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        acknowledgedByName: row.acknowledgedById
          ? (guardianNames.get(row.acknowledgedById) ?? null)
          : null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolution: row.resolution,
        note: row.note,
        reminderCount: row.reminderCount,
        delivery: summaries.get(row.id) ?? { sent: 0, pending: 0, failed: 0, notConfigured: 0 },
        deliveryState: aggregateDeliveryState(states.get(row.id) ?? []),
        relatedEventIds: status ? [status] : movement,
      }
    })
  }

  /**
   * 센서 알림(연결 끊김·복구·배터리)과 같은 때(앞뒤 2분) 같은 센서에서 남은 상태 이력의 움직임 기록 ID.
   * 센서 알림에는 근거 신호가 없어, 이 이력이 "관련 기록"이 된다.
   */
  private async statusEventIds(rows: AlertRow[]): Promise<Map<string, string>> {
    const sensorRows = rows.filter((row) => row.sensorId && STATUS_KINDS[row.type])
    const links = new Map<string, string>()
    if (sensorRows.length === 0) return links
    const times = sensorRows.map((row) => row.triggeredAt.getTime())
    const logs = await this.prisma.sensorStatusLog.findMany({
      where: {
        sensorId: { in: [...new Set(sensorRows.map((row) => row.sensorId as string))] },
        at: {
          gte: new Date(Math.min(...times) - STATUS_ALERT_LINK_WINDOW_MS),
          lte: new Date(Math.max(...times) + STATUS_ALERT_LINK_WINDOW_MS),
        },
      },
      select: { id: true, sensorId: true, kind: true, at: true },
    })
    for (const row of sensorRows) {
      const kinds = STATUS_KINDS[row.type] ?? []
      let best: { id: string; gap: number } | null = null
      for (const log of logs) {
        if (log.sensorId !== row.sensorId || !kinds.includes(log.kind)) continue
        const gap = Math.abs(log.at.getTime() - row.triggeredAt.getTime())
        if (gap <= STATUS_ALERT_LINK_WINDOW_MS && (best === null || gap < best.gap)) {
          best = { id: log.id, gap }
        }
      }
      if (best) links.set(row.id, `${STATUS_PREFIX}${best.id}`)
    }
    return links
  }
}
