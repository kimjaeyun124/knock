import {
  ALERT_PREFERENCE_BY_TYPE,
  DEFAULT_ALERT_PREFERENCES,
  DEFAULT_DETECTION_SETTINGS,
  type AlertPreferences,
  type AlertPreferencesInput,
  type AlertType,
  maskToWeekdays,
  weekdaysToMask,
  type DetectionSettings,
  type DetectionSettingsInput,
} from '@tetris/shared'
import { AlertPreferencesInputSchema, DetectionSettingsInputSchema } from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { AppError } from '@/utils/errors'

export type SensorThresholds = Pick<
  DetectionSettingsInput,
  'offlineAfterSeconds' | 'lowBatteryPercent' | 'criticalBatteryPercent'
>

type DetectionRow = Omit<DetectionSettingsInput, 'activeWeekdays'> & {
  activeWeekdays: number
  updatedAt: Date
}

function toDto(row: DetectionRow): DetectionSettings {
  return {
    monitoringEnabled: row.monitoringEnabled,
    activeWeekdays: maskToWeekdays(row.activeWeekdays),
    nightStart: row.nightStart,
    nightEnd: row.nightEnd,
    sensitivity: row.sensitivity,
    sequenceWindowMinutes: row.sequenceWindowMinutes,
    cooldownMinutes: row.cooldownMinutes,
    reminderMinutes: row.reminderMinutes,
    offlineAfterSeconds: row.offlineAfterSeconds,
    lowBatteryPercent: row.lowBatteryPercent,
    criticalBatteryPercent: row.criticalBatteryPercent,
    retentionDays: row.retentionDays,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 감지 설정. 모든 조회·수정은 로그인한 보호자의 가구(householdId)로만 한정된다. */
export class SettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** 아직 설정이 없는 가구에는 기본값으로 만들어 돌려준다. */
  async get(householdId: string): Promise<DetectionSettings> {
    const row = await this.prisma.detectionSettings.upsert({
      where: { householdId },
      create: { householdId },
      update: {},
    })
    return toDto(row)
  }

  /**
   * 센서 상태 계산에 필요한 기준값만 읽는다. 설정이 아직 없으면 기본값을 쓰며, 읽기만 한다.
   * (수집 요청마다 호출되므로 get() 처럼 설정 행을 만들지 않는다.)
   */
  async getThresholds(householdId: string): Promise<SensorThresholds> {
    const row = await this.prisma.detectionSettings.findUnique({
      where: { householdId },
      select: { offlineAfterSeconds: true, lowBatteryPercent: true, criticalBatteryPercent: true },
    })
    return row ?? DEFAULT_DETECTION_SETTINGS
  }

  /** 규칙 판단에 쓰는 모든 설정값. 설정이 아직 없으면 기본값을 쓰며, 읽기만 한다. */
  async getRules(householdId: string): Promise<DetectionSettingsInput> {
    const row = await this.prisma.detectionSettings.findUnique({ where: { householdId } })
    return row
      ? {
          monitoringEnabled: row.monitoringEnabled,
          activeWeekdays: maskToWeekdays(row.activeWeekdays),
          nightStart: row.nightStart,
          nightEnd: row.nightEnd,
          sensitivity: row.sensitivity,
          sequenceWindowMinutes: row.sequenceWindowMinutes,
          cooldownMinutes: row.cooldownMinutes,
          reminderMinutes: row.reminderMinutes,
          offlineAfterSeconds: row.offlineAfterSeconds,
          lowBatteryPercent: row.lowBatteryPercent,
          criticalBatteryPercent: row.criticalBatteryPercent,
          retentionDays: row.retentionDays,
        }
      : DEFAULT_DETECTION_SETTINGS
  }

  async update(householdId: string, input: DetectionSettingsInput): Promise<DetectionSettings> {
    const row = await this.prisma.detectionSettings.upsert({
      where: { householdId },
      create: { householdId, ...toRow(input) },
      update: toRow(input),
    })
    return toDto(row)
  }

  /** 알림 수신 설정. 아직 없는 가구에는 기본값(모두 받음)으로 만들어 돌려준다. */
  async getAlertPreferences(householdId: string): Promise<AlertPreferences> {
    const row = await this.prisma.alertPreferences.upsert({
      where: { householdId },
      create: { householdId },
      update: {},
    })
    return alertPreferencesDto(row)
  }

  async updateAlertPreferences(
    householdId: string,
    input: AlertPreferencesInput,
  ): Promise<AlertPreferences> {
    const row = await this.prisma.alertPreferences.upsert({
      where: { householdId },
      create: { householdId, ...input },
      update: input,
    })
    return alertPreferencesDto(row)
  }

  /**
   * 이 종류의 알림을 만들어도 되는가. 설정이 없으면 기본값(모두 받음)이며 읽기만 한다.
   * 끌 수 없는 종류(알림 전달 실패)는 항상 true 다.
   */
  async isAlertWanted(householdId: string, type: AlertType): Promise<boolean> {
    const key = (
      ALERT_PREFERENCE_BY_TYPE as Partial<Record<AlertType, keyof AlertPreferencesInput>>
    )[type]
    if (!key) return true
    const row = await this.prisma.alertPreferences.findUnique({ where: { householdId } })
    return (row ?? DEFAULT_ALERT_PREFERENCES)[key]
  }

  /**
   * 감지 설정과 받을 알림을 일부 항목만 바꾼다. (PATCH /api/v1/settings)
   * 지금 저장된 값에 바꿀 항목만 덮어쓴 결과를 **전체 규칙으로 검증**한 뒤, 둘을 한 트랜잭션으로 저장한다.
   * 알 수 없는 항목이 있거나 검증에 실패하면 아무것도 저장하지 않는다.
   */
  async patch(
    householdId: string,
    patch: { detection?: Record<string, unknown>; alerts?: Record<string, unknown> },
  ): Promise<{ detection: DetectionSettings; alerts: AlertPreferences }> {
    const current = await this.get(householdId)
    const currentAlerts = await this.getAlertPreferences(householdId)
    const { updatedAt: _d, ...detectionBase } = current
    const { updatedAt: _a, ...alertsBase } = currentAlerts

    rejectUnknownKeys('detection', patch.detection, Object.keys(DEFAULT_DETECTION_SETTINGS))
    rejectUnknownKeys('alerts', patch.alerts, Object.keys(DEFAULT_ALERT_PREFERENCES))
    const detection = DetectionSettingsInputSchema.parse({ ...detectionBase, ...patch.detection })
    const alerts = AlertPreferencesInputSchema.parse({ ...alertsBase, ...patch.alerts })

    await this.prisma.$transaction(async (tx) => {
      if (patch.detection) {
        await tx.detectionSettings.upsert({
          where: { householdId },
          create: { householdId, ...toRow(detection) },
          update: toRow(detection),
        })
      }
      if (patch.alerts) {
        await tx.alertPreferences.upsert({
          where: { householdId },
          create: { householdId, ...alerts },
          update: alerts,
        })
      }
    })
    return {
      detection: await this.get(householdId),
      alerts: await this.getAlertPreferences(householdId),
    }
  }
}

function toRow(input: DetectionSettingsInput) {
  const { activeWeekdays, ...rest } = input
  return { ...rest, activeWeekdays: weekdaysToMask(activeWeekdays) }
}

function alertPreferencesDto(row: AlertPreferencesInput & { updatedAt: Date }): AlertPreferences {
  return {
    bedAreaActivity: row.bedAreaActivity,
    bedToPath: row.bedToPath,
    entranceApproach: row.entranceApproach,
    repeatedMovement: row.repeatedMovement,
    sensorIssues: row.sensorIssues,
    lowBattery: row.lowBattery,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function rejectUnknownKeys(
  group: string,
  value: Record<string, unknown> | undefined,
  allowed: string[],
): void {
  const unknown = Object.keys(value ?? {}).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw AppError.badRequest(`알 수 없는 설정 항목입니다: ${group}.${unknown.join(', ')}`)
  }
}
