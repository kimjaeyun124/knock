import type { Alert as AlertRow } from '@/generated/prisma/client'
import type { PrismaClient } from '@/db/client'
import {
  deriveBatteryLevel,
  deriveSensorState,
  effectiveOfflineAfterSeconds,
} from '@/domain/sensor-status'
import { REPEATED_WINDOW_MINUTES, evaluateMovementRules } from '@/domain/rules/movement-rules'
import {
  batteryCandidate,
  deliveryFailedCandidate,
  offlineCandidate,
  restoredCandidate,
} from '@/domain/rules/sensor-rules'
import type { AlertCandidate, RuleEvent } from '@/domain/rules/types'
import type { RealtimeGateway } from '@/realtime/gateway'
import type { Logger } from '@/utils/logger'
import type { AlertService } from './alert.service'
import type { AcceptedEventsBatch, SensorStatusChange } from './ingest.service'
import type { SensorService } from './sensor.service'
import type { SettingsService } from './settings.service'

/**
 * 알림을 "만들어야 하는지" 판단해 AlertService 에 넘기는 조율자.
 * 판단 자체는 domain/ 의 순수 규칙이 하고, 여기서는 DB 에서 필요한 값을 읽어 규칙에 넣고 결과를 전달한다.
 */
export class AlertPipeline {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly alerts: AlertService,
    private readonly sensors: SensorService,
    private readonly gateway: RealtimeGateway,
    private readonly now: () => Date,
    private readonly logger: Logger,
  ) {}

  private monitoringChanged: ((householdId: string) => Promise<void>) | null = null

  /** 센서 연결 상태가 바뀐 것을 찾았을 때(주기 점검) 불린다. 화면에 모니터링 상태를 알리는 데 쓴다. */
  setMonitoringChangedListener(listener: (householdId: string) => Promise<void>): void {
    this.monitoringChanged = listener
  }

  /** 새 움직임 신호가 저장되었을 때: 야간 규칙을 평가한다. */
  async handleEvents(batch: AcceptedEventsBatch): Promise<void> {
    const { sensor } = batch
    const rules = await this.settings.getRules(sensor.householdId)
    const windowMs = Math.max(REPEATED_WINDOW_MINUTES, rules.sequenceWindowMinutes) * 60_000
    const since = new Date(Math.min(...batch.events.map((e) => e.occurredAt.getTime())) - windowMs)

    // 실제 센서와 시뮬레이터 신호는 섞어서 판단하지 않는다. (구역 이동의 의미가 없어진다)
    const rows = await this.prisma.movementEvent.findMany({
      where: { householdId: sensor.householdId, origin: sensor.origin, occurredAt: { gte: since } },
      include: { sensor: { select: { name: true, sensitivity: true, isActive: true } } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    })
    const recentEvents: RuleEvent[] = rows.map((row) => ({
      id: row.id,
      sensorId: row.sensorId,
      sensorName: row.sensor.name,
      sensitivity: row.sensor.sensitivity,
      // 판단에 함께 쓰는 다른 센서의 신호도 그 센서의 사용 여부를 따른다. (꺼 둔 센서의 신호를 흐름 판단에 섞지 않는다)
      sensorEnabled: row.sensor.isActive,
      ...(row.sensorId === sensor.id ? { connection: batch.connectionBefore } : {}),
      zone: row.zone,
      occurredAt: row.occurredAt,
      isLate: row.isLate,
    }))
    const newIds = new Set(batch.events.map((e) => e.id))

    const candidates = evaluateMovementRules({
      newEvents: recentEvents.filter((e) => newIds.has(e.id)),
      recentEvents,
      settings: rules,
      origin: sensor.origin,
    })
    for (const candidate of candidates) await this.raiseIfWanted(sensor.householdId, candidate)
  }

  /**
   * 보호자가 받지 않기로 한 종류의 알림은 만들지 않는다. (움직임 기록·센서 상태 화면에는 그대로 남는다)
   * 알림 전달 실패는 끌 수 없으므로 이 확인을 거치지 않는다.
   */
  private async raiseIfWanted(householdId: string, candidate: AlertCandidate): Promise<void> {
    if (!(await this.settings.isAlertWanted(householdId, candidate.type))) {
      this.logger.debug({ type: candidate.type }, '받지 않도록 설정된 알림이라 만들지 않음')
      return
    }
    await this.alerts.raise(householdId, candidate)
  }

  /** 센서 상태가 바뀌었을 때: 배터리 알림을 만들거나, 해소된 시스템 알림을 종료한다. */
  async handleSensorStatus(change: SensorStatusChange): Promise<void> {
    const { sensor, kind } = change
    if ((kind === 'BATTERY_LOW' || kind === 'BATTERY_CRITICAL') && sensor.batteryPercent !== null) {
      await this.raiseIfWanted(
        sensor.householdId,
        batteryCandidate({
          sensor,
          percent: sensor.batteryPercent,
          level: kind === 'BATTERY_LOW' ? 'LOW' : 'CRITICAL',
          now: this.now(),
        }),
      )
    } else if (kind === 'CONNECTED' || kind === 'BATTERY_OK') {
      await this.reconcileSystemAlerts(sensor.id)
      // 끊김을 기록해 둔 센서가 다시 돌아온 경우에만 복구를 알린다. (처음 연결, 끊김이 기록되기 전의 공백은 복구가 아니다)
      if (kind === 'CONNECTED' && (await this.wasDisconnectedBefore(sensor.id))) {
        await this.raiseIfWanted(sensor.householdId, restoredCandidate({ sensor, now: this.now() }))
      }
    }
  }

  /**
   * 방금 남긴 CONNECTED 기록 바로 앞의 연결 상태 기록이 DISCONNECTED 인가.
   * (연결 상태 기록은 연결됨 ↔ 끊김이 번갈아 쌓이므로, 앞 기록이 끊김이면 끊겼다 돌아온 것이다)
   */
  private async wasDisconnectedBefore(sensorId: string): Promise<boolean> {
    const [, previous] = await this.prisma.sensorStatusLog.findMany({
      where: { sensorId, kind: { in: ['CONNECTED', 'DISCONNECTED'] } },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: 2,
      select: { kind: true },
    })
    return previous?.kind === 'DISCONNECTED'
  }

  /** 알림 전달이 모두 실패했을 때: "알림을 전달하지 못했습니다" 알림을 남긴다. */
  async handleDeliveryExhausted(alert: AlertRow): Promise<void> {
    await this.alerts.raise(
      alert.householdId,
      deliveryFailedCandidate({
        origin: alert.origin,
        failedAlertTitle: alert.title,
        now: this.now(),
      }),
    )
  }

  /**
   * 신호가 끊긴 센서를 찾는다. (주기 점검)
   * 연결 끊김은 신호가 "없을 때" 생기므로 요청이 아니라 시간의 흐름으로 감지해야 한다.
   */
  async checkSensorConnections(): Promise<number> {
    const now = this.now()
    const sensors = await this.prisma.sensor.findMany({
      where: { isActive: true, lastSeenAt: { not: null } },
    })
    const thresholds = new Map<string, Awaited<ReturnType<SettingsService['getThresholds']>>>()
    let found = 0

    for (const sensor of sensors) {
      let threshold = thresholds.get(sensor.householdId)
      if (!threshold) {
        threshold = await this.settings.getThresholds(sensor.householdId)
        thresholds.set(sensor.householdId, threshold)
      }
      const state = deriveSensorState({
        isActive: sensor.isActive,
        lastSeenAt: sensor.lastSeenAt,
        now,
        offlineAfterSeconds: effectiveOfflineAfterSeconds(sensor, threshold),
      })
      if (state !== 'OFFLINE' || !sensor.lastSeenAt) continue
      found += 1
      const silentSeconds = (now.getTime() - sensor.lastSeenAt.getTime()) / 1000

      // 끊김 이력은 연결 → 끊김으로 바뀌는 순간에 한 번만 남긴다.
      const last = await this.prisma.sensorStatusLog.findFirst({
        where: { sensorId: sensor.id, kind: { in: ['CONNECTED', 'DISCONNECTED'] } },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
      })
      if (last?.kind !== 'DISCONNECTED' || last.at.getTime() < sensor.lastSeenAt.getTime()) {
        await this.prisma.sensorStatusLog.create({
          data: {
            sensorId: sensor.id,
            at: now,
            kind: 'DISCONNECTED',
            detail: `${Math.floor(silentSeconds / 60)}분 이상 신호가 없습니다.`,
          },
        })
        this.gateway.emitToHousehold(sensor.householdId, 'sensor.status', {
          sensor: await this.sensors.present(sensor),
          change: 'DISCONNECTED',
        })
        await this.monitoringChanged?.(sensor.householdId)
      }

      // 같은 구역을 맡은 활성 센서가 이 센서뿐이면 그 구역 전체가 확인되지 않으므로 긴급이다.
      const sameZone = await this.prisma.sensor.count({
        where: { householdId: sensor.householdId, zone: sensor.zone, isActive: true },
      })
      await this.raiseIfWanted(
        sensor.householdId,
        offlineCandidate({ sensor, silentSeconds, soleSensorInZone: sameZone <= 1, now }),
      )
    }
    return found
  }

  /**
   * 조건이 풀린 시스템 알림(연결 끊김·배터리 부족)을 자동 종료한다.
   * 센서가 다시 연결되었거나 꺼졌거나 삭제되었거나 배터리가 회복된 경우다.
   */
  async reconcileSystemAlerts(sensorId?: string): Promise<number> {
    const open = await this.prisma.alert.findMany({
      where: {
        type: { in: ['SENSOR_OFFLINE', 'LOW_BATTERY'] },
        status: { not: 'RESOLVED' },
        ...(sensorId ? { sensorId } : {}),
      },
    })
    const now = this.now()
    let resolved = 0
    for (const alert of open) {
      const sensor = alert.sensorId
        ? await this.prisma.sensor.findUnique({ where: { id: alert.sensorId } })
        : null
      let stillTrue = false
      if (sensor?.isActive) {
        const threshold = await this.settings.getThresholds(sensor.householdId)
        stillTrue =
          alert.type === 'SENSOR_OFFLINE'
            ? deriveSensorState({
                isActive: sensor.isActive,
                lastSeenAt: sensor.lastSeenAt,
                now,
                offlineAfterSeconds: effectiveOfflineAfterSeconds(sensor, threshold),
              }) === 'OFFLINE'
            : ['LOW', 'CRITICAL'].includes(deriveBatteryLevel(sensor.batteryPercent, threshold))
      }
      if (!stillTrue) {
        await this.alerts.autoResolve(alert.householdId, alert.id)
        resolved += 1
        this.logger.debug(
          { alertId: alert.id, type: alert.type },
          '조건이 해소되어 알림을 자동 종료',
        )
      }
    }
    return resolved
  }
}
