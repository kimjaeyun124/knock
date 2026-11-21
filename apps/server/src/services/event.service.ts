import type {
  DailySummaryDay,
  DailySummaryResponse,
  EventsResponse,
  MovementEvent,
} from '@tetris/shared'
import type { EventsQuerySchema } from '@tetris/shared'
import type { z } from 'zod'
import type { PrismaClient } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { decodeCursor, encodeCursor } from '@/utils/cursor'

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
/** 움직임을 근거로 만들어지는 알림 유형. 센서 상태·전달 실패 알림은 "주의 이벤트"로 세지 않는다. */
const MOVEMENT_ALERT_TYPES = [
  'BED_AREA_ACTIVITY',
  'BED_TO_PATH',
  'ENTRANCE_APPROACH',
  'REPEATED_MOVEMENT',
] as const

/** 한국 시간 기준 날짜 (YYYY-MM-DD) */
function kstDateString(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 한국 시간 그날 0시(UTC Date) */
function kstDayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - KST_OFFSET_MS)
}

export type EventsFilter = z.output<typeof EventsQuerySchema> & {
  /** 정렬 방향. 기본은 최신순(desc) */
  order?: 'asc' | 'desc'
}

type EventRow = Prisma.MovementEventGetPayload<{ include: { sensor: { select: { name: true } } } }>

function toMovementEvent(row: EventRow): MovementEvent {
  return {
    id: row.id,
    sensorId: row.sensorId,
    sensorName: row.sensor.name,
    zone: row.zone,
    origin: row.origin,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    isLate: row.isLate,
  }
}

/** 움직임 기록 조회. 로그인한 보호자의 가구 기록만 최신순으로 돌려준다. */
export class EventService {
  /** now: 서버의 시계. 테스트에서 바꿔 끼운다. ("오늘"을 기준으로 하는 요약이 실제 날짜에 흔들리지 않게) */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(householdId: string, filter: EventsFilter): Promise<EventsResponse> {
    const cursor = filter.cursor ? decodeCursor(filter.cursor) : undefined
    const order = filter.order ?? 'desc'
    // 커서 다음 쪽: 최신순이면 더 이전(lt), 오래된순이면 더 이후(gt)
    const after = order === 'desc' ? 'lt' : 'gt'
    const where: Prisma.MovementEventWhereInput = {
      householdId,
      ...(filter.zone ? { zone: filter.zone } : {}),
      ...(filter.origin ? { origin: filter.origin } : {}),
      ...(filter.sensorId ? { sensorId: filter.sensorId } : {}),
      ...(filter.from || filter.to
        ? {
            occurredAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { occurredAt: { [after]: new Date(cursor.atMs) } },
              { occurredAt: new Date(cursor.atMs), id: { [after]: cursor.id } },
            ],
          }
        : {}),
    }

    // 다음 쪽이 있는지 알기 위해 한 건 더 읽는다.
    const rows = await this.prisma.movementEvent.findMany({
      where,
      orderBy: [{ occurredAt: order }, { id: order }],
      take: filter.limit + 1,
      include: { sensor: { select: { name: true } } },
    })
    const page = rows.slice(0, filter.limit)
    const last = page.at(-1)

    const events: MovementEvent[] = page.map(toMovementEvent)
    return {
      events,
      nextCursor:
        rows.length > filter.limit && last
          ? encodeCursor({ atMs: last.occurredAt.getTime(), id: last.id })
          : null,
    }
  }

  /** 움직임 기록 한 건. 다른 가구의 기록이거나 없으면 null. */
  async get(householdId: string, id: string): Promise<MovementEvent | null> {
    const row = await this.prisma.movementEvent.findFirst({
      where: { id, householdId },
      include: { sensor: { select: { name: true } } },
    })
    return row ? toMovementEvent(row) : null
  }

  /**
   * 최근 N일(오늘 포함, 한국 시간 날짜 기준)의 날짜별 움직임 신호 수와 주의 알림 수.
   * 기록이 없는 날도 0건으로 채워 돌려준다. (빈 날이 그래프에서 사라지지 않게)
   */
  async dailySummary(
    householdId: string,
    days: number,
    now: Date = this.clock(),
  ): Promise<DailySummaryResponse> {
    const dates: string[] = []
    for (let back = days - 1; back >= 0; back -= 1) {
      dates.push(kstDateString(new Date(now.getTime() - back * DAY_MS)))
    }
    const from = kstDayStart(dates[0] ?? kstDateString(now))

    const [events, alerts] = await Promise.all([
      this.prisma.movementEvent.findMany({
        where: { householdId, occurredAt: { gte: from } },
        select: { occurredAt: true, origin: true },
      }),
      this.prisma.alert.findMany({
        where: {
          householdId,
          triggeredAt: { gte: from },
          severity: { in: ['NOTICE', 'URGENT'] },
          type: { in: [...MOVEMENT_ALERT_TYPES] },
        },
        select: { triggeredAt: true },
      }),
    ])

    const byDate = new Map<string, DailySummaryDay>(
      dates.map((date) => [
        date,
        { date, movements: 0, simulatedMovements: 0, attentionAlerts: 0 },
      ]),
    )
    for (const event of events) {
      const day = byDate.get(kstDateString(event.occurredAt))
      if (!day) continue // 오늘 이후(시계 오차로 미래 시각)는 세지 않는다
      day.movements += 1
      if (event.origin === 'SIMULATED') day.simulatedMovements += 1
    }
    for (const alert of alerts) {
      const day = byDate.get(kstDateString(alert.triggeredAt))
      if (day) day.attentionAlerts += 1
    }
    return { days: dates.map((date) => byDate.get(date)!), generatedAt: now.toISOString() }
  }
}
