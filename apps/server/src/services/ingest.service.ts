import {
  INGEST_LIMITS,
  type SensorState,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type IngestEventResult,
  type IngestEventsRequest,
  type IngestEventsResponse,
} from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { classifyMovementEvent } from '@/domain/rules/classify'
import {
  CONNECTED_DETAIL,
  deriveBatteryLevel,
  deriveSensorState,
  effectiveOfflineAfterSeconds,
} from '@/domain/sensor-status'
import type {
  MovementEvent as MovementEventRow,
  Sensor as SensorRow,
} from '@/generated/prisma/client'
import type { Logger } from '@/utils/logger'
import type { SensorThresholds, SettingsService } from './settings.service'

export interface AcceptedEventsBatch {
  sensor: SensorRow
  events: MovementEventRow[]
  /** 이 신호를 받기 직전의 센서 연결 상태. (끊겨 있다가 돌아온 센서의 신호를 알아보는 데 쓴다) */
  connectionBefore: SensorState
}

type StatusLogKind = 'CONNECTED' | 'BATTERY_LOW' | 'BATTERY_CRITICAL' | 'BATTERY_OK'

/** 신호를 받으면서 센서 상태가 바뀐 것 (첫 연결·복구·배터리 수준 변화) */
export interface SensorStatusChange {
  /** 변화가 반영된 센서 */
  sensor: SensorRow
  kind: StatusLogKind
  detail: string
}

type Listener<T> = (value: T) => void | Promise<void>

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

/**
 * 장치가 보낸 움직임 이벤트와 상태 신호를 받는다.
 *
 * - 같은 이벤트 ID 는 몇 번 보내도 한 번만 저장한다. (멱등)
 * - 늦게 도착한 이벤트도 버리지 않고 "지연 수신"으로 표시해 저장한다.
 * - 구역·출처(실제/시뮬레이터)는 장치가 보내지 않고 등록된 센서 정보에서 가져온다.
 * - 요청을 받았다는 것 자체가 "센서가 살아 있다"는 신호이므로 마지막 신호 시각을 갱신한다.
 */
export class IngestService {
  private readonly eventListeners = new Set<Listener<AcceptedEventsBatch>>()
  private readonly statusListeners = new Set<Listener<SensorStatusChange>>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly now: () => Date,
    private readonly logger: Logger,
  ) {}

  /**
   * 새 이벤트가 저장될 때마다 호출된다. 규칙 엔진·실시간 발행이 여기에 연결된다.
   * 장치에 응답하기 전에 모두 끝난 뒤(성공이든 실패든) 응답한다. 후처리가 실패해도 이벤트 저장은 유지되며,
   * 실패는 로그에만 남고 장치 요청은 성공으로 응답한다.
   */
  onEventsAccepted(listener: Listener<AcceptedEventsBatch>): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  /** 첫 연결·연결 복구·배터리 수준 변화가 기록될 때마다 호출된다. */
  onSensorStatusChange(listener: Listener<SensorStatusChange>): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  async ingestEvents(sensor: SensorRow, input: IngestEventsRequest): Promise<IngestEventsResponse> {
    const receivedAt = this.now()
    const nowMs = receivedAt.getTime()
    const thresholds = await this.settings.getThresholds(sensor.householdId)
    const schedule = await this.settings.getRules(sensor.householdId)
    const connectionBefore = deriveSensorState({
      isActive: sensor.isActive,
      lastSeenAt: sensor.lastSeenAt,
      now: receivedAt,
      offlineAfterSeconds: effectiveOfflineAfterSeconds(sensor, thresholds),
    })

    const existing = await this.prisma.movementEvent.findMany({
      where: { sensorId: sensor.id, deviceEventId: { in: input.events.map((e) => e.eventId) } },
      select: { deviceEventId: true },
    })
    const seen = new Set(existing.map((e) => e.deviceEventId))

    const results: IngestEventResult[] = []
    const accepted: MovementEventRow[] = []

    for (const event of input.events) {
      if (seen.has(event.eventId)) {
        results.push({ eventId: event.eventId, status: 'DUPLICATE' })
        continue
      }
      if (event.type !== sensor.kind) {
        results.push({ eventId: event.eventId, status: 'REJECTED', reason: 'TYPE_MISMATCH' })
        continue
      }

      const occurredAt = event.occurredAt ? new Date(event.occurredAt) : receivedAt
      const ageMs = nowMs - occurredAt.getTime()
      if (-ageMs > INGEST_LIMITS.futureToleranceSeconds * 1000) {
        results.push({ eventId: event.eventId, status: 'REJECTED', reason: 'FUTURE_TIMESTAMP' })
        continue
      }
      if (ageMs > INGEST_LIMITS.maxEventAgeHours * 3_600_000) {
        results.push({ eventId: event.eventId, status: 'REJECTED', reason: 'TOO_OLD' })
        continue
      }

      try {
        const row = await this.prisma.movementEvent.create({
          data: {
            householdId: sensor.householdId,
            sensorId: sensor.id,
            zone: sensor.zone,
            origin: sensor.origin,
            deviceEventId: event.eventId,
            occurredAt,
            receivedAt,
            isLate: ageMs >= INGEST_LIMITS.lateEventSeconds * 1000,
            // 받을 때 판단 엔진이 분류해 저장한다. (이후 설정이 바뀌어도 과거 기록의 분류는 그대로)
            eventClass: classifyMovementEvent({
              zone: sensor.zone,
              occurredAt,
              schedule,
              sensorEnabled: sensor.isActive,
              connection: connectionBefore,
            }).eventClass,
          },
        })
        seen.add(event.eventId)
        accepted.push(row)
        results.push({ eventId: event.eventId, status: 'ACCEPTED' })
      } catch (error) {
        // 같은 이벤트가 동시에 두 번 도착해 다른 요청이 먼저 저장한 경우
        if (!isUniqueViolation(error)) throw error
        results.push({ eventId: event.eventId, status: 'DUPLICATE' })
      }
    }

    await this.recordSignal(sensor, receivedAt, thresholds, {}, false)
    const rejected = results.filter((r) => r.status === 'REJECTED')
    if (rejected.length > 0) {
      await this.recordReceiveError(
        sensor.id,
        receivedAt,
        rejected.length,
        rejected.at(-1)?.reason ?? 'REJECTED',
      )
    }
    if (accepted.length > 0)
      await this.notify(
        this.eventListeners,
        { sensor, events: accepted, connectionBefore },
        sensor.id,
      )

    return { serverTime: receivedAt.toISOString(), results }
  }

  async recordHeartbeat(sensor: SensorRow, input: HeartbeatRequest): Promise<HeartbeatResponse> {
    const now = this.now()
    const thresholds = await this.settings.getThresholds(sensor.householdId)
    await this.recordSignal(sensor, now, thresholds, input, true)
    return { serverTime: now.toISOString() }
  }

  /**
   * 서버가 받지 못한 데이터(거부된 이벤트, 형식이 틀린 요청)를 센서에 기록한다. 센서 화면의 "데이터 수신 오류"가 이 값을 쓴다.
   * 요청 자체는 장치 토큰으로 인증된 것이므로 어느 센서의 오류인지 알 수 있다. 오류 내용(본문)은 저장하지 않고 이유 코드만 남긴다.
   */
  async recordReceiveError(
    sensorId: string,
    at: Date,
    count: number,
    reason: string,
  ): Promise<void> {
    await this.prisma.sensor.update({
      where: { id: sensorId },
      data: {
        receiveErrorCount: { increment: count },
        lastReceiveErrorAt: at,
        lastReceiveError: reason.slice(0, 40),
      },
    })
  }

  /**
   * 마지막 신호 시각·배터리·펌웨어를 갱신하고, 상태가 바뀌었다면 이력(SensorStatusLog)을 남긴다.
   * 연결 끊김(DISCONNECTED) 기록은 신호가 "없을 때" 생기므로 주기 점검(Phase 3)이 맡는다.
   */
  private async recordSignal(
    sensor: SensorRow,
    now: Date,
    thresholds: SensorThresholds,
    input: HeartbeatRequest,
    heartbeat: boolean,
  ): Promise<void> {
    const previousState = deriveSensorState({
      isActive: sensor.isActive,
      lastSeenAt: sensor.lastSeenAt,
      now,
      offlineAfterSeconds: effectiveOfflineAfterSeconds(sensor, thresholds),
    })

    const logs: Array<{ kind: StatusLogKind; detail: string }> = []
    if (previousState === 'PENDING') {
      logs.push({ kind: 'CONNECTED', detail: CONNECTED_DETAIL.FIRST })
    } else if (previousState === 'OFFLINE') {
      logs.push({ kind: 'CONNECTED', detail: CONNECTED_DETAIL.RESTORED })
    }

    if (input.batteryPercent !== undefined) {
      const before = deriveBatteryLevel(sensor.batteryPercent, thresholds)
      const after = deriveBatteryLevel(input.batteryPercent, thresholds)
      if (before !== after) {
        if (after === 'LOW')
          logs.push({ kind: 'BATTERY_LOW', detail: `배터리 ${input.batteryPercent}%` })
        else if (after === 'CRITICAL') {
          logs.push({ kind: 'BATTERY_CRITICAL', detail: `배터리 ${input.batteryPercent}%` })
        } else if (after === 'OK' && before !== 'UNKNOWN') {
          logs.push({ kind: 'BATTERY_OK', detail: `배터리 ${input.batteryPercent}%` })
        }
      }
    }

    const data = {
      lastSeenAt:
        sensor.lastSeenAt && sensor.lastSeenAt.getTime() > now.getTime() ? sensor.lastSeenAt : now,
      ...(heartbeat ? { lastHeartbeatAt: now } : {}),
      ...(input.batteryPercent !== undefined ? { batteryPercent: input.batteryPercent } : {}),
      ...(input.firmware !== undefined ? { firmwareVersion: input.firmware } : {}),
    }

    // 같은 센서의 요청이 동시에 와도 상태 이력이 중복으로 남지 않도록,
    // 마지막 신호 시각이 처음 읽은 값 그대로일 때만 "상태 변화를 처리할 권한"을 얻는다.
    const claimed = await this.prisma.sensor.updateMany({
      where: { id: sensor.id, lastSeenAt: sensor.lastSeenAt },
      data,
    })
    if (claimed.count === 0) {
      await this.prisma.sensor.update({ where: { id: sensor.id }, data })
      return
    }
    for (const log of logs) {
      await this.prisma.sensorStatusLog.create({
        data: { sensorId: sensor.id, at: now, kind: log.kind, detail: log.detail },
      })
    }
    if (logs.length > 0) {
      const fresh = await this.prisma.sensor.findUnique({ where: { id: sensor.id } })
      if (fresh) {
        for (const log of logs) {
          await this.notify(
            this.statusListeners,
            { sensor: fresh, kind: log.kind, detail: log.detail },
            sensor.id,
          )
        }
      }
    }
  }

  private async notify<T>(listeners: Set<Listener<T>>, value: T, sensorId: string): Promise<void> {
    const results = await Promise.allSettled(
      [...listeners].map(async (listener) => listener(value)),
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        // 수신 후처리(알림 판단 등)의 실패가 장치 응답을 실패로 만들지 않게 한다.
        this.logger.error({ err: result.reason, sensorId }, '이벤트 후처리 실패')
      }
    }
  }
}
