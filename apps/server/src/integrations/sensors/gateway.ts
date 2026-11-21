import {
  GATEWAY_DEDUPE,
  type DataOrigin,
  type GatewayResult,
  type StandardSensorEvent,
} from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import type { IngestService } from '@/services/ingest.service'
import type { Logger } from '@/utils/logger'
import { EventDeduper } from './event-deduper'
import type { SensorAdapter, Unsubscribe } from './types'

/**
 * 어댑터가 들여보낸 표준 이벤트를 서버의 같은 처리 경로(IngestService)로 넣는다.
 * HTTP 수집 API 도 같은 IngestService 를 쓰므로 시뮬레이터·실제 센서의 신호가 같은 저장·규칙·알림 경로를 지난다.
 *
 * 하는 일: 센서 식별(장치 번호) → 출처 확인 → 비활성 센서 거부 → 중복 제거 → 수집 서비스 호출 → 오류를 삼키지 않고 결과로 돌려줌.
 * 하지 않는 일: 모르는 장치의 센서를 자동으로 만들기. 장치는 보호자가 먼저 등록해야 한다.
 */
export class SensorEventGateway {
  private readonly deduper: EventDeduper
  private readonly attached = new Map<string, Unsubscribe>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingest: IngestService,
    now: () => Date,
    private readonly logger: Logger,
  ) {
    this.deduper = new EventDeduper(
      now,
      GATEWAY_DEDUPE.ttlSeconds * 1000,
      GATEWAY_DEDUPE.maxEntries,
    )
  }

  /**
   * 어댑터의 신호를 이 가구의 센서로 받는다. (어댑터 하나는 가구 하나에 묶인다 —
   * 서로 다른 가구가 같은 장치 번호를 쓸 수 있으므로 장치 번호만으로는 센서를 정하지 않는다)
   */
  attach(adapter: SensorAdapter, householdId: string): Unsubscribe {
    this.attached.get(adapter.id)?.()
    const off = adapter.subscribeEvents(async (event) => {
      await this.handle(householdId, adapter.origin, event)
    })
    this.attached.set(adapter.id, off)
    return () => {
      off()
      this.attached.delete(adapter.id)
    }
  }

  async handle(
    householdId: string,
    origin: DataOrigin,
    event: StandardSensorEvent,
  ): Promise<GatewayResult> {
    const key = `${householdId}|${event.deviceId}|${event.eventId}`
    if (!this.deduper.firstSeen(key)) return { eventId: event.eventId, status: 'DUPLICATE' }

    try {
      const sensor = await this.prisma.sensor.findUnique({
        where: { householdId_deviceId: { householdId, deviceId: event.deviceId } },
      })
      if (!sensor) return this.reject(key, event, 'UNKNOWN_DEVICE')
      // 시뮬레이터 어댑터가 실제 센서의 기록을 만들거나 그 반대가 되지 않게 한다.
      if (sensor.origin !== origin) return this.reject(key, event, 'ORIGIN_MISMATCH')
      if (!sensor.isActive) return this.reject(key, event, 'SENSOR_DISABLED')

      if (event.eventType === 'STATUS') {
        await this.ingest.recordHeartbeat(sensor, {
          ...(event.payload.batteryPercent !== undefined
            ? { batteryPercent: event.payload.batteryPercent }
            : {}),
          ...(event.payload.firmware !== undefined ? { firmware: event.payload.firmware } : {}),
        })
        return { eventId: event.eventId, status: 'ACCEPTED' }
      }

      const response = await this.ingest.ingestEvents(sensor, {
        events: [{ eventId: event.eventId, type: sensor.kind, occurredAt: event.occurredAt }],
      })
      const result = response.results[0]
      if (!result) return this.fail(key, event, new Error('수집 결과가 비어 있습니다.'))
      return result.status === 'REJECTED'
        ? {
            eventId: event.eventId,
            status: 'REJECTED',
            ...(result.reason ? { reason: result.reason } : {}),
          }
        : { eventId: event.eventId, status: result.status }
    } catch (error) {
      return this.fail(key, event, error)
    }
  }

  private reject(
    key: string,
    event: StandardSensorEvent,
    reason: NonNullable<GatewayResult['reason']>,
  ): GatewayResult {
    // 보호자가 장치를 등록·활성화한 뒤 같은 신호를 다시 보낼 수 있도록 기억하지 않는다.
    this.deduper.forget(key)
    return { eventId: event.eventId, status: 'REJECTED', reason }
  }

  private fail(key: string, event: StandardSensorEvent, error: unknown): GatewayResult {
    this.deduper.forget(key)
    this.logger.error({ err: error, eventId: event.eventId }, '센서 이벤트 처리 실패')
    return { eventId: event.eventId, status: 'ERROR' }
  }
}
