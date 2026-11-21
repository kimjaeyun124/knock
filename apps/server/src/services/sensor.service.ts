import {
  LONG_SILENT_SECONDS,
  MAX_SENSORS_PER_HOUSEHOLD,
  type Sensor,
  type SensorCreate,
  type SensorDeleteResponse,
  type SensorUpdate,
  type SensorWithTokenResponse,
  supportsHardwareSensitivity,
} from '@tetris/shared'
import {
  deriveBatteryLevel,
  deriveSensorState,
  effectiveOfflineAfterSeconds,
} from '@/domain/sensor-status'
import type { PrismaClient } from '@/db/client'
import type { Sensor as SensorRow } from '@/generated/prisma/client'
import { AppError } from '@/utils/errors'
import { generateDeviceToken, hashToken } from '@/utils/tokens'
import type { SensorThresholds, SettingsService } from './settings.service'

export function toSensorDto(row: SensorRow, now: Date, thresholds: SensorThresholds): Sensor {
  const offlineAfter = effectiveOfflineAfterSeconds(row, thresholds)
  const state = deriveSensorState({
    isActive: row.isActive,
    lastSeenAt: row.lastSeenAt,
    now,
    offlineAfterSeconds: offlineAfter,
  })
  const silentSeconds = row.lastSeenAt
    ? Math.max(0, Math.floor((now.getTime() - row.lastSeenAt.getTime()) / 1000))
    : null
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    zone: row.zone,
    origin: row.origin,
    isActive: row.isActive,
    state,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    offlineAfterSeconds: row.offlineAfterSeconds,
    effectiveOfflineAfterSeconds: offlineAfter,
    silentSeconds,
    longSilent:
      state === 'OFFLINE' && silentSeconds !== null && silentSeconds >= LONG_SILENT_SECONDS,
    receiveErrors: {
      count: row.receiveErrorCount,
      lastAt: row.lastReceiveErrorAt?.toISOString() ?? null,
      lastReason: row.lastReceiveError,
    },
    batteryPercent: row.batteryPercent,
    batteryLevel: deriveBatteryLevel(row.batteryPercent, thresholds),
    firmwareVersion: row.firmwareVersion,
    deviceId: row.deviceId,
    sensitivity: row.sensitivity,
    hardwareSensitivitySupported: supportsHardwareSensitivity(row.kind),
    createdAt: row.createdAt.toISOString(),
  }
}

const NOT_FOUND = '센서를 찾을 수 없습니다.'

/** 같은 가구에 같은 장치 번호가 이미 있으면(유일성 위반) 409 로 알린다. 그 밖의 오류는 그대로 던진다. */
function rethrowDeviceIdConflict(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
    throw AppError.conflict('이미 등록된 장치 번호입니다. 다른 번호를 입력해 주세요.')
  }
  throw error
}

/**
 * 센서 등록·관리. 모든 조회·수정은 householdId 로 한정한다.
 * 다른 가구의 센서 ID 를 넣어도 "없는 센서"와 똑같이 404 로 응답한다. (존재 여부를 알려 주지 않음)
 */
export class SensorService {
  private changed: ((householdId: string) => void) | null = null

  /** 센서를 만들거나 바꾸거나 지웠을 때 불린다. 화면에 모니터링 상태를 알리는 데 쓴다. */
  setChangedListener(listener: (householdId: string) => void): void {
    this.changed = listener
  }

  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly now: () => Date,
  ) {}

  async list(householdId: string): Promise<Sensor[]> {
    const [rows, thresholds] = await Promise.all([
      this.prisma.sensor.findMany({ where: { householdId }, orderBy: { createdAt: 'asc' } }),
      this.settings.getThresholds(householdId),
    ])
    const now = this.now()
    return rows.map((row) => toSensorDto(row, now, thresholds))
  }

  async get(householdId: string, id: string): Promise<Sensor> {
    return this.present(await this.findOwned(householdId, id))
  }

  /** 사용자가 앱에서 등록하는 실제 센서. 시뮬레이터 센서는 createSimulated 로 따로 만든다. */
  create(householdId: string, input: SensorCreate): Promise<SensorWithTokenResponse> {
    return this.createWithOrigin(householdId, input, 'REAL')
  }

  /** 시뮬레이터가 쓰는 가상 센서. 이 센서의 이벤트와 알림은 SIMULATED 로 표시된다. */
  createSimulated(householdId: string, input: SensorCreate): Promise<SensorWithTokenResponse> {
    return this.createWithOrigin(householdId, input, 'SIMULATED')
  }

  private async createWithOrigin(
    householdId: string,
    input: SensorCreate,
    origin: 'REAL' | 'SIMULATED',
  ): Promise<SensorWithTokenResponse> {
    const count = await this.prisma.sensor.count({ where: { householdId } })
    if (count >= MAX_SENSORS_PER_HOUSEHOLD) {
      throw AppError.conflict(`센서는 최대 ${MAX_SENSORS_PER_HOUSEHOLD}개까지 등록할 수 있습니다.`)
    }
    const deviceToken = generateDeviceToken()
    const row = await this.prisma.sensor
      .create({
        data: {
          householdId,
          name: input.name,
          zone: input.zone,
          kind: 'MOTION',
          origin,
          tokenHash: hashToken(deviceToken),
          ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
        },
      })
      .catch(rethrowDeviceIdConflict)
    this.changed?.(householdId)
    return { sensor: await this.present(row), deviceToken }
  }

  async update(householdId: string, id: string, patch: SensorUpdate): Promise<Sensor> {
    await this.findOwned(householdId, id)
    const row = await this.prisma.sensor
      .update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.zone !== undefined ? { zone: patch.zone } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.sensitivity !== undefined ? { sensitivity: patch.sensitivity } : {}),
          ...(patch.deviceId !== undefined ? { deviceId: patch.deviceId } : {}),
          ...(patch.offlineAfterSeconds !== undefined
            ? { offlineAfterSeconds: patch.offlineAfterSeconds }
            : {}),
        },
      })
      .catch(rethrowDeviceIdConflict)
    this.changed?.(householdId)
    return this.present(row)
  }

  /** 새 토큰을 발급하고 이전 토큰은 즉시 무효로 만든다. */
  async rotateToken(householdId: string, id: string): Promise<SensorWithTokenResponse> {
    await this.findOwned(householdId, id)
    const deviceToken = generateDeviceToken()
    const row = await this.prisma.sensor.update({
      where: { id },
      data: { tokenHash: hashToken(deviceToken) },
    })
    return { sensor: await this.present(row), deviceToken }
  }

  /**
   * 센서와 그 움직임 기록을 함께 지운다. 되돌릴 수 없으므로 먼저 비활성화한 센서만 지울 수 있다.
   * (실수로 기록을 잃는 일을 막는다. 평소에는 "사용 안 함"으로 끄는 것을 권한다.)
   */
  async remove(householdId: string, id: string): Promise<SensorDeleteResponse> {
    const row = await this.findOwned(householdId, id)
    if (row.isActive) {
      throw AppError.conflict('센서를 삭제하려면 먼저 "사용 안 함"으로 바꿔 주세요.')
    }
    const deletedEvents = await this.prisma.movementEvent.count({ where: { sensorId: id } })
    await this.prisma.sensor.delete({ where: { id } })
    this.changed?.(householdId)
    return { ok: true, deletedEvents }
  }

  /** 장치 토큰으로 센서를 찾는다. 수집 API 인증에 쓴다. */
  findByDeviceToken(token: string): Promise<SensorRow | null> {
    return this.prisma.sensor.findUnique({ where: { tokenHash: hashToken(token) } })
  }

  private async findOwned(householdId: string, id: string): Promise<SensorRow> {
    const row = await this.prisma.sensor.findFirst({ where: { id, householdId } })
    if (!row) throw AppError.notFound(NOT_FOUND)
    return row
  }

  /** 센서 행을 화면용 DTO(연결 상태·배터리 수준 포함)로 바꾼다. */
  async present(row: SensorRow): Promise<Sensor> {
    return toSensorDto(row, this.now(), await this.settings.getThresholds(row.householdId))
  }
}
