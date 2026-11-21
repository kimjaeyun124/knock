import {
  ALERT_CLIP_LIMITS,
  AlertClipMimeTypeSchema,
  type AlertClip,
  type AlertClipMimeType,
} from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { AppError } from '@/utils/errors'

interface ClipRow {
  id: string
  alertId: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  createdAt: Date
}

/** Content-Type 에서 매개변수(codecs 등)를 떼고 허용된 영상 형식인지 본다. */
export function parseClipMimeType(contentType: string | undefined): AlertClipMimeType | null {
  const base = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const parsed = AlertClipMimeTypeSchema.safeParse(base)
  return parsed.success ? parsed.data : null
}

/**
 * 알림에 붙는 짧은 영상(시연용 웹캠)을 저장하고 보여 준다.
 *
 * - 시뮬레이션 알림에만 붙인다. (영상은 시연용 웹캠에서만 오며, 실제 센서 알림에는 영상이 없다)
 * - 다른 가구의 알림은 "없는 것"과 같은 404 로 답한다.
 * - 크기·형식·개수를 제한하고, 보관 기간이 지나면 purgeOlderThan 이 지운다.
 * - 영상 내용은 로그에 남기지 않는다.
 */
export class AlertClipService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
  ) {}

  async save(
    householdId: string,
    alertId: string,
    input: { mimeType: AlertClipMimeType; data: Buffer; durationMs: number | null },
  ): Promise<AlertClip> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, householdId },
      select: { id: true, origin: true, _count: { select: { clips: true } } },
    })
    if (!alert) throw AppError.notFound('알림을 찾을 수 없습니다.')
    if (alert.origin !== 'SIMULATED') {
      throw AppError.conflict('영상은 시연용(시뮬레이션) 알림에만 붙일 수 있습니다.')
    }
    if (input.data.length === 0) throw AppError.badRequest('영상이 비어 있습니다.')
    if (input.data.length > ALERT_CLIP_LIMITS.maxBytes) {
      throw new AppError(413, 'BAD_REQUEST', '영상이 너무 큽니다.')
    }
    if (alert._count.clips >= ALERT_CLIP_LIMITS.maxPerAlert) {
      throw AppError.conflict(
        `알림 하나에는 영상을 ${ALERT_CLIP_LIMITS.maxPerAlert}개까지만 붙일 수 있습니다.`,
      )
    }
    const row = await this.prisma.alertClip.create({
      data: {
        alertId,
        householdId,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        durationMs: input.durationMs,
        data: new Uint8Array(input.data),
        createdAt: this.now(),
      },
      select: CLIP_SELECT,
    })
    return present(row)
  }

  async list(householdId: string, alertId: string): Promise<AlertClip[]> {
    await this.requireAlert(householdId, alertId)
    const rows = await this.prisma.alertClip.findMany({
      where: { alertId, householdId },
      orderBy: { createdAt: 'asc' },
      select: CLIP_SELECT,
    })
    return rows.map(present)
  }

  async get(
    householdId: string,
    alertId: string,
    clipId: string,
  ): Promise<{ mimeType: string; data: Buffer }> {
    const row = await this.prisma.alertClip.findFirst({
      where: { id: clipId, alertId, householdId },
      select: { mimeType: true, data: true },
    })
    if (!row) throw AppError.notFound('영상을 찾을 수 없습니다.')
    return { mimeType: row.mimeType, data: Buffer.from(row.data) }
  }

  /** 보관 기간이 지난 영상을 지운다. 지운 개수를 돌려준다. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(
      this.now().getTime() - ALERT_CLIP_LIMITS.retentionDays * 24 * 60 * 60 * 1000,
    )
    const { count } = await this.prisma.alertClip.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    return count
  }

  private async requireAlert(householdId: string, alertId: string): Promise<void> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, householdId },
      select: { id: true },
    })
    if (!alert) throw AppError.notFound('알림을 찾을 수 없습니다.')
  }
}

const CLIP_SELECT = {
  id: true,
  alertId: true,
  mimeType: true,
  sizeBytes: true,
  durationMs: true,
  createdAt: true,
} as const

function present(row: ClipRow): AlertClip {
  return {
    id: row.id,
    alertId: row.alertId,
    mimeType: AlertClipMimeTypeSchema.parse(row.mimeType),
    sizeBytes: row.sizeBytes,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    url: `/api/alerts/${encodeURIComponent(row.alertId)}/clips/${encodeURIComponent(row.id)}`,
  }
}
