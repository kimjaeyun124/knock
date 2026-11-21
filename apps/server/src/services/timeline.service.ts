import {
  ATTENTION_FROM,
  MOVEMENT_EVENT_TYPES,
  type AlertSeverity,
  type AlertType,
  type DetectionSettingsInput,
  type SensorStatusLogKind,
  type TimelineDetailResponse,
  type TimelineEvent,
  type TimelineEventType,
  type TimelineOrder,
  type TimelineQuerySchema,
  type TimelineResponse,
  type TimelineSummaryResponse,
  type MovementClass,
} from '@tetris/shared'
import type { z } from 'zod'
import type { PrismaClient } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import {
  MOVEMENT_PREFIX,
  STATUS_PREFIX,
  STATUS_ALERT_LINK_WINDOW_MS,
  describeEvent,
  movementAttention,
  ruleFor,
  statusAlertType,
  statusAttention,
  statusEventType,
} from '@/domain/timeline'
import { decodeCursor, encodeCursor, type ListCursor } from '@/utils/cursor'
import { AppError } from '@/utils/errors'
import type { SettingsService } from './settings.service'

export type TimelineListQuery = z.output<typeof TimelineQuerySchema>
export type TimelineFilter = Omit<TimelineListQuery, 'order' | 'limit' | 'cursor'>

/** 센서 상태 변화는 드물어 한 번에 메모리로 읽어 걸러 낸다. 이보다 많으면 오래된 것부터 잘린다. */
const STATUS_SCAN_LIMIT = 2000
const RELATED_LIMIT = 20

const MOVEMENT_TYPES: readonly TimelineEventType[] = MOVEMENT_EVENT_TYPES

/** 센서 상태 이벤트 유형 → 기록된 상태 종류 (BATTERY_OK 는 기록 대상이 아니다) */
const KINDS_BY_TYPE: Partial<Record<TimelineEventType, SensorStatusLogKind[]>> = {
  SENSOR_OFFLINE: ['DISCONNECTED'],
  SENSOR_RESTORED: ['CONNECTED'],
  LOW_BATTERY: ['BATTERY_LOW', 'BATTERY_CRITICAL'],
}
const ALL_STATUS_KINDS: SensorStatusLogKind[] = [
  'DISCONNECTED',
  'CONNECTED',
  'BATTERY_LOW',
  'BATTERY_CRITICAL',
]

type MovementRow = Prisma.MovementEventGetPayload<{
  include: {
    sensor: { select: { name: true } }
    evidence: {
      include: { alert: { select: { id: true; type: true; severity: true; status: true } } }
    }
  }
}>

const MOVEMENT_INCLUDE = {
  sensor: { select: { name: true } },
  evidence: {
    include: { alert: { select: { id: true, type: true, severity: true, status: true } } },
  },
} as const

interface StatusRow {
  id: string
  sensorId: string
  at: Date
  kind: SensorStatusLogKind
  detail: string | null
  sensor: { name: string; zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE'; origin: 'REAL' | 'SIMULATED' }
}

interface AlertRef {
  id: string
  type: AlertType
  severity: AlertSeverity
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  sensorId: string | null
  triggeredAt: Date
}

const keyOf = (event: TimelineEvent): string => event.id
const atMsOf = (event: TimelineEvent): number => Date.parse(event.occurredAt)

/** a 가 b 보다 정렬 순서에서 앞에 오는가 (같은 시각이면 ID 로 가른다) */
function compare(order: TimelineOrder) {
  return (a: TimelineEvent, b: TimelineEvent): number => {
    const byTime = atMsOf(a) - atMsOf(b)
    const byKey = keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0
    const asc = byTime !== 0 ? byTime : byKey
    return order === 'asc' ? asc : -asc
  }
}

/** 이벤트가 cursor 다음(정렬 방향 기준)에 있는가 */
function isAfter(event: TimelineEvent, cursor: ListCursor, order: TimelineOrder): boolean {
  const at = atMsOf(event)
  if (at !== cursor.atMs) return order === 'desc' ? at < cursor.atMs : at > cursor.atMs
  return order === 'desc' ? keyOf(event) < cursor.id : keyOf(event) > cursor.id
}

/** 움직임 신호 쿼리에 붙이는 "cursor 다음" 조건. 센서 상태 이벤트(sta_)와 같은 시각일 때의 순서도 맞춘다. */
function movementAfterCursor(
  cursor: ListCursor,
  order: TimelineOrder,
): Prisma.MovementEventWhereInput {
  const op = order === 'desc' ? 'lt' : 'gt'
  const time = new Date(cursor.atMs)
  const sameTime: Prisma.MovementEventWhereInput[] = []
  if (cursor.id.startsWith(MOVEMENT_PREFIX)) {
    sameTime.push({ occurredAt: time, id: { [op]: cursor.id.slice(MOVEMENT_PREFIX.length) } })
  } else if (order === 'desc') {
    // mov_ 는 sta_ 보다 앞서므로, 내림차순에서는 같은 시각의 움직임이 상태 이벤트 뒤에 온다.
    sameTime.push({ occurredAt: time })
  }
  return { OR: [{ occurredAt: { [op]: time } }, ...sameTime] }
}

/** 움직임 신호의 주의 수준 조건: 연결된 알림 중 가장 높은 심각도가 정확히 그 수준인 것 */
function movementAttentionWhere(
  level: NonNullable<TimelineFilter['attention']>,
): Prisma.MovementEventWhereInput {
  const some = (severities: AlertSeverity[]): Prisma.AlertEvidenceListRelationFilter => ({
    some: { alert: { severity: { in: severities } } },
  })
  const none = (severities: AlertSeverity[]): Prisma.AlertEvidenceListRelationFilter => ({
    none: { alert: { severity: { in: severities } } },
  })
  switch (level) {
    case 'NORMAL':
      return { evidence: { none: {} } }
    case 'URGENT':
      return { evidence: some(['URGENT']) }
    case 'NOTICE':
      return { AND: [{ evidence: some(['NOTICE']) }, { evidence: none(['URGENT']) }] }
    case 'INFO':
      return { AND: [{ evidence: some(['INFO']) }, { evidence: none(['NOTICE', 'URGENT']) }] }
  }
}

function movementWhere(
  householdId: string,
  filter: TimelineFilter,
): Prisma.MovementEventWhereInput | null {
  // 센서 상태 이벤트 유형만 고른 경우에는 움직임 신호를 읽지 않는다.
  if (filter.type && !MOVEMENT_TYPES.includes(filter.type)) return null
  const and: Prisma.MovementEventWhereInput[] = []
  // 유형은 신호를 받을 때 판단 엔진이 정해 저장한 분류(eventClass)다.
  if (filter.type) and.push({ eventClass: filter.type as MovementClass })
  if (filter.attention) and.push(movementAttentionWhere(filter.attention))
  if (filter.alert === 'true') and.push({ evidence: { some: {} } })
  if (filter.alert === 'false') and.push({ evidence: { none: {} } })
  return {
    householdId,
    ...(filter.sensorId ? { sensorId: filter.sensorId } : {}),
    ...(filter.from || filter.to
      ? {
          occurredAt: {
            ...(filter.from ? { gte: new Date(filter.from) } : {}),
            ...(filter.to ? { lte: new Date(filter.to) } : {}),
          },
        }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  }
}

/**
 * 움직임 기록(타임라인). 움직임 신호와 센서 상태 변화(연결 끊김·복구·배터리 부족)를 시간순으로 합쳐 돌려준다.
 * 유형·주의 수준·알림 연결은 저장하지 않고 원본(신호·상태 이력·알림 근거)에서 그때그때 정한다. (domain/timeline.ts)
 * 로그인한 보호자의 가구 기록만 다룬다.
 */
export class TimelineService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  async list(householdId: string, query: TimelineListQuery): Promise<TimelineResponse> {
    const { limit, order } = query
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
    const rules = await this.settings.getRules(householdId)

    const where = movementWhere(householdId, query)
    const movementRows = where
      ? await this.prisma.movementEvent.findMany({
          where: cursor ? { AND: [where, movementAfterCursor(cursor, order)] } : where,
          orderBy: [{ occurredAt: order }, { id: order }],
          take: limit + 1,
          include: MOVEMENT_INCLUDE,
        })
      : []
    const movement = movementRows.map((row) => this.fromMovement(row, rules))

    const status = (await this.loadStatusEvents(householdId, query, rules))
      .filter((event) => (cursor ? isAfter(event, cursor, order) : true))
      .sort(compare(order))
      .slice(0, limit + 1)

    // 각 출처에서 limit+1 건씩만 읽어도, 합친 순서의 앞 limit+1 건은 그 안에 모두 들어 있다.
    const merged = [...movement, ...status].sort(compare(order)).slice(0, limit + 1)
    const events = merged.slice(0, limit)
    const last = events.at(-1)
    return {
      events,
      nextCursor:
        merged.length > limit && last
          ? encodeCursor({ atMs: atMsOf(last), id: keyOf(last) })
          : null,
    }
  }

  async summary(householdId: string, filter: TimelineFilter): Promise<TimelineSummaryResponse> {
    const rules = await this.settings.getRules(householdId)
    const where = movementWhere(householdId, filter)

    let total = 0
    let attention = 0
    let alertRaised = 0
    let last: number | null = null
    if (where) {
      const [count, attentionCount, alertCount, latest] = await Promise.all([
        this.prisma.movementEvent.count({ where }),
        this.prisma.movementEvent.count({
          where: {
            AND: [
              where,
              { evidence: { some: { alert: { severity: { in: ['NOTICE', 'URGENT'] } } } } },
            ],
          },
        }),
        this.prisma.movementEvent.count({ where: { AND: [where, { evidence: { some: {} } }] } }),
        this.prisma.movementEvent.findFirst({
          where,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          select: { occurredAt: true },
        }),
      ])
      total += count
      attention += attentionCount
      alertRaised += alertCount
      last = latest ? latest.occurredAt.getTime() : null
    }

    const status = await this.loadStatusEvents(householdId, filter, rules)
    total += status.length
    attention += status.filter((event) => ATTENTION_FROM.includes(event.attention)).length
    alertRaised += status.filter((event) => event.alertRaised).length
    for (const event of status) last = Math.max(last ?? 0, atMsOf(event))

    return {
      total,
      attention,
      alertRaised,
      lastEventAt: last === null ? null : new Date(last).toISOString(),
      generatedAt: new Date().toISOString(),
    }
  }

  async get(householdId: string, id: string): Promise<TimelineDetailResponse> {
    const rules = await this.settings.getRules(householdId)

    if (id.startsWith(MOVEMENT_PREFIX)) {
      const row = await this.prisma.movementEvent.findFirst({
        where: { id: id.slice(MOVEMENT_PREFIX.length), householdId },
        include: MOVEMENT_INCLUDE,
      })
      if (!row) throw AppError.notFound('기록을 찾을 수 없습니다.')
      const event = this.fromMovement(row, rules)
      const alertIds = row.evidence.map((item) => item.alert.id)
      const others =
        alertIds.length === 0
          ? []
          : await this.prisma.alertEvidence.findMany({
              where: { alertId: { in: alertIds }, eventId: { not: row.id } },
              include: { event: { include: { sensor: { select: { name: true } } } } },
              take: RELATED_LIMIT * 2,
            })
      const seen = new Set<string>()
      const relatedEvents = others
        .map((item) => item.event)
        .filter((related) => (seen.has(related.id) ? false : (seen.add(related.id), true)))
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .slice(0, RELATED_LIMIT)
        .map((related) => ({
          id: `${MOVEMENT_PREFIX}${related.id}`,
          sensorName: related.sensor.name,
          zone: related.zone,
          occurredAt: related.occurredAt.toISOString(),
        }))
      return { event, relatedEvents }
    }

    if (id.startsWith(STATUS_PREFIX)) {
      const row = await this.prisma.sensorStatusLog.findFirst({
        where: { id: id.slice(STATUS_PREFIX.length), sensor: { householdId } },
        include: { sensor: { select: { name: true, zone: true, origin: true } } },
      })
      if (!row || !statusEventType(row.kind)) throw AppError.notFound('기록을 찾을 수 없습니다.')
      const alerts = await this.alertsNear(householdId, [row])
      return { event: this.fromStatus(row, alerts, rules), relatedEvents: [] }
    }

    throw AppError.notFound('기록을 찾을 수 없습니다.')
  }

  private fromMovement(row: MovementRow, rules: DetectionSettingsInput): TimelineEvent {
    const alerts = row.evidence.map((item) => item.alert)
    const type = row.eventClass
    return {
      id: `${MOVEMENT_PREFIX}${row.id}`,
      sensorId: row.sensorId,
      sensorName: row.sensor.name,
      eventType: type,
      zone: row.zone,
      origin: row.origin,
      occurredAt: row.occurredAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      isLate: row.isLate,
      attention: movementAttention(alerts.map((alert) => alert.severity)),
      alertRaised: alerts.length > 0,
      alerts,
      description: describeEvent({ type, sensorName: row.sensor.name, zone: row.zone }),
      rule: ruleFor({ type, alerts, settings: rules }),
    }
  }

  private fromStatus(
    row: StatusRow,
    alerts: readonly AlertRef[],
    rules: DetectionSettingsInput,
  ): TimelineEvent {
    const type = statusEventType(row.kind)
    if (!type) throw new Error(`기록 대상이 아닌 상태 종류입니다: ${row.kind}`)
    const linked = this.linkAlerts(row, alerts).map(
      ({ id, type: alertType, severity, status }) => ({
        id,
        type: alertType,
        severity,
        status,
      }),
    )
    const at = row.at.toISOString()
    return {
      id: `${STATUS_PREFIX}${row.id}`,
      sensorId: row.sensorId,
      sensorName: row.sensor.name,
      eventType: type,
      zone: row.sensor.zone,
      origin: row.sensor.origin,
      occurredAt: at,
      receivedAt: at,
      isLate: false,
      attention: statusAttention(row.kind),
      alertRaised: linked.length > 0,
      alerts: linked,
      description: describeEvent({
        type,
        sensorName: row.sensor.name,
        zone: row.sensor.zone,
        detail: row.detail,
        critical: row.kind === 'BATTERY_CRITICAL',
      }),
      rule: ruleFor({ type, alerts: linked, settings: rules }),
    }
  }

  /** 상태 변화와 같은 때(앞뒤 2분) 같은 센서에서 만들어진 같은 종류의 알림 */
  private linkAlerts(row: StatusRow, alerts: readonly AlertRef[]): AlertRef[] {
    const alertType = statusAlertType(row.kind)
    if (!alertType) return []
    return alerts.filter(
      (alert) =>
        alert.type === alertType &&
        alert.sensorId === row.sensorId &&
        Math.abs(alert.triggeredAt.getTime() - row.at.getTime()) <= STATUS_ALERT_LINK_WINDOW_MS,
    )
  }

  private async alertsNear(householdId: string, rows: readonly StatusRow[]): Promise<AlertRef[]> {
    if (rows.length === 0) return []
    const times = rows.map((row) => row.at.getTime())
    return this.prisma.alert.findMany({
      where: {
        householdId,
        type: { in: ['SENSOR_OFFLINE', 'SENSOR_RESTORED', 'LOW_BATTERY'] },
        sensorId: { in: [...new Set(rows.map((row) => row.sensorId))] },
        triggeredAt: {
          gte: new Date(Math.min(...times) - STATUS_ALERT_LINK_WINDOW_MS),
          lte: new Date(Math.max(...times) + STATUS_ALERT_LINK_WINDOW_MS),
        },
      },
      select: {
        id: true,
        type: true,
        severity: true,
        status: true,
        sensorId: true,
        triggeredAt: true,
      },
    })
  }

  /** 조건에 맞는 센서 상태 이벤트 전부 (주의 수준·알림 조건은 연결을 계산한 뒤 메모리에서 거른다) */
  private async loadStatusEvents(
    householdId: string,
    filter: TimelineFilter,
    rules: DetectionSettingsInput,
  ): Promise<TimelineEvent[]> {
    if (filter.type && MOVEMENT_TYPES.includes(filter.type)) return []
    const kinds = filter.type ? (KINDS_BY_TYPE[filter.type] ?? []) : ALL_STATUS_KINDS
    const rows = await this.prisma.sensorStatusLog.findMany({
      where: {
        sensor: { householdId },
        kind: { in: kinds },
        ...(filter.sensorId ? { sensorId: filter.sensorId } : {}),
        ...(filter.from || filter.to
          ? {
              at: {
                ...(filter.from ? { gte: new Date(filter.from) } : {}),
                ...(filter.to ? { lte: new Date(filter.to) } : {}),
              },
            }
          : {}),
      },
      include: { sensor: { select: { name: true, zone: true, origin: true } } },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: STATUS_SCAN_LIMIT,
    })
    const alerts = await this.alertsNear(householdId, rows)
    return rows
      .map((row) => this.fromStatus(row, alerts, rules))
      .filter((event) => (filter.attention ? event.attention === filter.attention : true))
      .filter((event) =>
        filter.alert === undefined ? true : event.alertRaised === (filter.alert === 'true'),
      )
  }
}
