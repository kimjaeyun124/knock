import { PURGE_INTERVAL_MS } from '@/config/notifications'
import type { PrismaClient } from '@/db/client'
import type { Logger } from '@/utils/logger'
import type { AlertPipeline } from './alert-pipeline.service'
import type { AlertClipService } from './alert-clip.service'
import type { AlertService } from './alert.service'
import type { NotificationService } from './notification.service'
import type { SettingsService } from './settings.service'

export interface PurgeResult {
  events: number
  alerts: number
  statusLogs: number
}

/**
 * 주기 점검(30초마다): 신호가 끊긴 센서 찾기 → 해소된 시스템 알림 종료 → 알림 전달 재시도 →
 * 확인하지 않은 긴급 알림 재알림 → (1시간마다) 보관 기간이 지난 기록 정리.
 * 한 단계가 실패해도 나머지 단계는 계속 실행한다.
 */
export class MaintenanceService {
  private lastPurgeAt = 0
  private lastTickFinishedAt: Date | null = null

  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly pipeline: AlertPipeline,
    private readonly alerts: AlertService,
    private readonly notifications: NotificationService,
    private readonly now: () => Date,
    private readonly logger: Logger,
    /** 알림 영상(시연용 웹캠). 보관 기간이 지나면 지운다. */
    private readonly clips: AlertClipService | null = null,
  ) {}

  /** 주기 점검이 마지막으로 끝난 시각. 아직 한 번도 돌지 않았으면 null */
  lastTickAt(): Date | null {
    return this.lastTickFinishedAt
  }

  async tick(): Promise<void> {
    await this.step('센서 연결 점검', () => this.pipeline.checkSensorConnections())
    await this.step('해소된 시스템 알림 종료', () => this.pipeline.reconcileSystemAlerts())
    await this.step('알림 전달 재시도', () => this.notifications.retryDue())
    await this.step('긴급 알림 재알림', () => this.alerts.sendDueReminders())
    if (this.now().getTime() - this.lastPurgeAt >= PURGE_INTERVAL_MS) {
      this.lastPurgeAt = this.now().getTime()
      await this.step('오래된 기록 정리', () => this.purgeOldData())
      if (this.clips) {
        const clips = this.clips
        await this.step('보관 기간이 지난 알림 영상 정리', () => clips.purgeExpired())
      }
    }
    this.lastTickFinishedAt = this.now()
  }

  /** 가구별 보관 기간(retentionDays)이 지난 움직임 기록·종료된 알림·센서 상태 이력을 지운다. */
  async purgeOldData(): Promise<PurgeResult> {
    const households = await this.prisma.household.findMany({ select: { id: true } })
    const total: PurgeResult = { events: 0, alerts: 0, statusLogs: 0 }
    for (const { id: householdId } of households) {
      const { retentionDays } = await this.settings.getRules(householdId)
      const cutoff = new Date(this.now().getTime() - retentionDays * 24 * 60 * 60 * 1000)
      total.events += (
        await this.prisma.movementEvent.deleteMany({
          where: { householdId, occurredAt: { lt: cutoff } },
        })
      ).count
      total.alerts += (
        await this.prisma.alert.deleteMany({
          where: { householdId, status: 'RESOLVED', resolvedAt: { lt: cutoff } },
        })
      ).count
      total.statusLogs += (
        await this.prisma.sensorStatusLog.deleteMany({
          where: { at: { lt: cutoff }, sensor: { householdId } },
        })
      ).count
    }
    return total
  }

  private async step(name: string, task: () => Promise<unknown>): Promise<void> {
    try {
      await task()
    } catch (error) {
      this.logger.error({ err: error, step: name }, '주기 점검 단계 실패')
    }
  }
}
