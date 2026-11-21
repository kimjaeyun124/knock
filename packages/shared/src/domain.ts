import { z } from './zod'

/**
 * 도메인 열거형. 값은 apps/server/prisma/schema.prisma 의 enum 과 같아야 한다.
 * (서버의 schema.test.ts 가 어긋남을 검사한다)
 */

export const GUARDIAN_ROLES = ['OWNER', 'MEMBER'] as const
export const GuardianRoleSchema = z.enum(GUARDIAN_ROLES)
export type GuardianRole = z.infer<typeof GuardianRoleSchema>

export const ZONE_KINDS = ['BED_SIDE', 'PATH', 'ENTRANCE'] as const
export const ZoneKindSchema = z.enum(ZONE_KINDS)
export type ZoneKind = z.infer<typeof ZoneKindSchema>

/** 화면에 보이는 구역 이름. 센서가 위치를 확정하는 것이 아니라 "센서가 설치된 구역"을 뜻한다. */
export const ZONE_LABELS: Record<ZoneKind, string> = {
  BED_SIDE: '침대 주변',
  PATH: '이동 경로',
  ENTRANCE: '현관',
}

export const SENSOR_KINDS = ['MOTION'] as const
export const SensorKindSchema = z.enum(SENSOR_KINDS)
export type SensorKind = z.infer<typeof SensorKindSchema>

export const DATA_ORIGINS = ['REAL', 'SIMULATED'] as const
export const DataOriginSchema = z.enum(DATA_ORIGINS)
export type DataOrigin = z.infer<typeof DataOriginSchema>

export const SENSITIVITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export const SensitivitySchema = z.enum(SENSITIVITIES)
export type Sensitivity = z.infer<typeof SensitivitySchema>

export const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  LOW: '낮음',
  MEDIUM: '보통',
  HIGH: '높음',
}

export const SENSOR_STATUS_LOG_KINDS = [
  'CONNECTED',
  'DISCONNECTED',
  'BATTERY_LOW',
  'BATTERY_CRITICAL',
  'BATTERY_OK',
] as const
export const SensorStatusLogKindSchema = z.enum(SENSOR_STATUS_LOG_KINDS)
export type SensorStatusLogKind = z.infer<typeof SensorStatusLogKindSchema>

export const ALERT_TYPES = [
  'BED_AREA_ACTIVITY',
  'BED_TO_PATH',
  'ENTRANCE_APPROACH',
  'REPEATED_MOVEMENT',
  'SENSOR_OFFLINE',
  'SENSOR_RESTORED',
  'LOW_BATTERY',
  'DELIVERY_FAILED',
] as const
export const AlertTypeSchema = z.enum(ALERT_TYPES)
export type AlertType = z.infer<typeof AlertTypeSchema>

export const ALERT_SEVERITIES = ['INFO', 'NOTICE', 'URGENT'] as const
export const AlertSeveritySchema = z.enum(ALERT_SEVERITIES)
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const
export const AlertStatusSchema = z.enum(ALERT_STATUSES)
export type AlertStatus = z.infer<typeof AlertStatusSchema>

/** CHECKED: 확인함 / FALSE_ALARM: 잘못된 알림 / AUTO_RESOLVED: 조건이 해소되어 자동 종료 */
export const RESOLUTIONS = ['CHECKED', 'FALSE_ALARM', 'AUTO_RESOLVED'] as const
export const ResolutionSchema = z.enum(RESOLUTIONS)
export type Resolution = z.infer<typeof ResolutionSchema>

export const CHANNELS = ['IN_APP', 'WEB_PUSH', 'WATCH', 'SMS', 'KAKAO'] as const
export const ChannelSchema = z.enum(CHANNELS)
export type Channel = z.infer<typeof ChannelSchema>

/** CANCELLED: 알림이 확인·종료되어 전달을 멈춤 */
export const DELIVERY_STATUSES = [
  'PENDING',
  'SENT',
  'FAILED',
  'NOT_CONFIGURED',
  'CANCELLED',
] as const
export const DeliveryStatusSchema = z.enum(DELIVERY_STATUSES)
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>

/** 알림 채널이 실제 연동인지 가짜(Mock) 응답인지 */
export const PROVIDER_MODES = ['REAL', 'MOCK'] as const
export const ProviderModeSchema = z.enum(PROVIDER_MODES)
export type ProviderMode = z.infer<typeof ProviderModeSchema>

/**
 * 센서 연결 상태 (저장하지 않고 마지막 신호 시각과 설정으로 계산한다)
 * PENDING: 등록만 되고 아직 신호를 받지 못함 / DISABLED: 사용자가 끔
 */
export const SENSOR_STATES = ['PENDING', 'ONLINE', 'OFFLINE', 'DISABLED'] as const
export const SensorStateSchema = z.enum(SENSOR_STATES)
export type SensorState = z.infer<typeof SensorStateSchema>

export const SENSOR_STATE_LABELS: Record<SensorState, string> = {
  PENDING: '첫 신호 대기 중',
  ONLINE: '연결됨',
  OFFLINE: '연결 끊김',
  DISABLED: '사용 안 함',
}

/** 배터리 수준. 설정의 부족·위급 기준으로 계산한다. UNKNOWN: 아직 배터리 정보를 받지 못함 */
export const BATTERY_LEVELS = ['UNKNOWN', 'OK', 'LOW', 'CRITICAL'] as const
export const BatteryLevelSchema = z.enum(BATTERY_LEVELS)
export type BatteryLevel = z.infer<typeof BatteryLevelSchema>
