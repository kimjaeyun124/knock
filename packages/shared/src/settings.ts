import { z } from './zod'
import { SensitivitySchema, type Sensitivity } from './domain'

const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '시각은 HH:mm 형식이어야 합니다.')

/** 요일 번호. 0=월 … 6=일 (한국에서 쓰는 순서) */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const
export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const
export const ALL_WEEKDAYS: number[] = [...WEEKDAYS]

const WeekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b))

/** PUT /api/settings/detection 요청: 모든 항목을 함께 보낸다 (부분 수정 없음) */
export const DetectionSettingsInputSchema = z
  .object({
    /** 모니터링(움직임 알림 판단) 사용 여부. 끄면 움직임은 기록되지만 움직임 알림은 만들어지지 않는다. */
    monitoringEnabled: z.boolean().default(true),
    /** 모니터링할 요일. 야간 구간이 시작되는 날 기준이다. (월요일 22:00~06:00 은 월요일 일정) */
    activeWeekdays: WeekdaysSchema.default(ALL_WEEKDAYS),
    /** 야간 모니터링 시작·종료 (Asia/Seoul). 종료가 시작보다 이르면 자정을 넘는 구간이다. */
    nightStart: TimeOfDaySchema,
    nightEnd: TimeOfDaySchema,
    sensitivity: SensitivitySchema,
    /** 침대 주변 → 이동 경로 움직임을 하나의 흐름으로 볼 시간 창 */
    sequenceWindowMinutes: z.number().int().min(1).max(60),
    /** 같은 유형 알림을 다시 만들지 않는 시간 */
    cooldownMinutes: z.number().int().min(1).max(120),
    /** 긴급 알림을 확인하지 않았을 때 다시 알리는 간격 */
    reminderMinutes: z.number().int().min(1).max(60),
    /** 센서 신호가 이 시간 동안 없으면 연결 끊김으로 본다 */
    offlineAfterSeconds: z.number().int().min(60).max(3600),
    lowBatteryPercent: z.number().int().min(5).max(50),
    criticalBatteryPercent: z.number().int().min(1).max(49),
    /** 원본 움직임 기록 보관 기간 */
    retentionDays: z.number().int().min(7).max(365),
  })
  .refine((v) => !v.monitoringEnabled || v.activeWeekdays.length > 0, {
    path: ['activeWeekdays'],
    message: '모니터링할 요일을 하나 이상 고르거나, 모니터링을 끄세요.',
  })
  .refine((v) => v.nightStart !== v.nightEnd, {
    path: ['nightEnd'],
    message: '야간 시작과 종료 시각은 달라야 합니다.',
  })
  .refine((v) => v.criticalBatteryPercent < v.lowBatteryPercent, {
    path: ['criticalBatteryPercent'],
    message: '배터리 위급 기준은 부족 기준보다 낮아야 합니다.',
  })

export type DetectionSettingsInput = z.infer<typeof DetectionSettingsInputSchema>

export const DetectionSettingsSchema = z.object({
  monitoringEnabled: z.boolean(),
  activeWeekdays: z.array(z.number().int().min(0).max(6)),
  nightStart: TimeOfDaySchema,
  nightEnd: TimeOfDaySchema,
  sensitivity: SensitivitySchema,
  sequenceWindowMinutes: z.number().int(),
  cooldownMinutes: z.number().int(),
  reminderMinutes: z.number().int(),
  offlineAfterSeconds: z.number().int(),
  lowBatteryPercent: z.number().int(),
  criticalBatteryPercent: z.number().int(),
  retentionDays: z.number().int(),
  updatedAt: z.iso.datetime(),
})
export type DetectionSettings = z.infer<typeof DetectionSettingsSchema>

/** 새 가구의 기본 설정. DB 스키마의 @default 와 같아야 한다. (서버 테스트가 검사) */
export const DEFAULT_DETECTION_SETTINGS: DetectionSettingsInput = {
  monitoringEnabled: true,
  activeWeekdays: ALL_WEEKDAYS,
  nightStart: '22:00',
  nightEnd: '06:00',
  sensitivity: 'MEDIUM' satisfies Sensitivity,
  sequenceWindowMinutes: 10,
  cooldownMinutes: 10,
  reminderMinutes: 5,
  offlineAfterSeconds: 300,
  lowBatteryPercent: 20,
  criticalBatteryPercent: 10,
  retentionDays: 90,
}

/**
 * 어떤 알림을 받을지. 끄면 그 종류의 알림이 만들어지지 않는다.
 * (움직임 기록과 센서 상태 화면에는 그대로 남는다. 알림 전달 실패 알림은 항상 켜져 있다.)
 */
export const AlertPreferencesInputSchema = z.object({
  /** 침대 주변 움직임 */
  bedAreaActivity: z.boolean(),
  /** 침대 주변에서 이동 경로로 이어진 움직임 */
  bedToPath: z.boolean(),
  /** 현관 근처 움직임 */
  entranceApproach: z.boolean(),
  /** 짧은 시간 안의 반복된 움직임 */
  repeatedMovement: z.boolean(),
  /** 센서 연결 끊김·복구 */
  sensorIssues: z.boolean(),
  /** 센서 배터리 부족·위급 */
  lowBattery: z.boolean(),
})
export type AlertPreferencesInput = z.infer<typeof AlertPreferencesInputSchema>

export const AlertPreferencesSchema = AlertPreferencesInputSchema.extend({
  updatedAt: z.iso.datetime(),
})
export type AlertPreferences = z.infer<typeof AlertPreferencesSchema>

/** 새 가구의 기본값: 모두 받는다. DB 스키마의 @default 와 같아야 한다. (서버 테스트가 검사) */
export const DEFAULT_ALERT_PREFERENCES: AlertPreferencesInput = {
  bedAreaActivity: true,
  bedToPath: true,
  entranceApproach: true,
  repeatedMovement: true,
  sensorIssues: true,
  lowBattery: true,
}

/** 알림 종류 → 끌 수 있는 설정 항목. 여기에 없는 종류(알림 전달 실패)는 끌 수 없다. */
export const ALERT_PREFERENCE_BY_TYPE = {
  BED_AREA_ACTIVITY: 'bedAreaActivity',
  BED_TO_PATH: 'bedToPath',
  ENTRANCE_APPROACH: 'entranceApproach',
  REPEATED_MOVEMENT: 'repeatedMovement',
  SENSOR_OFFLINE: 'sensorIssues',
  SENSOR_RESTORED: 'sensorIssues',
  LOW_BATTERY: 'lowBattery',
} as const satisfies Partial<Record<string, keyof AlertPreferencesInput>>

/** 요일 목록 ↔ DB 에 저장하는 비트마스크(월=1 … 일=64). SQLite 에는 배열 열이 없어 정수 하나로 저장한다. */
export function weekdaysToMask(days: readonly number[]): number {
  return days.reduce((mask, day) => mask | (1 << day), 0)
}

export function maskToWeekdays(mask: number): number[] {
  return WEEKDAYS.filter((day) => (mask & (1 << day)) !== 0)
}

/** 반복 이동 판단에 쓰는 시간 창(분) */
export const REPEATED_WINDOW_MINUTES = 30

/**
 * 구역이 바뀐 것으로 세려면 직전 신호와 이만큼(초) 이상 떨어져 있어야 한다.
 * 이웃한 두 센서의 감지 범위가 겹쳐 한 번의 움직임에 번갈아 반응하는 경우를 여러 번의 이동으로 세지 않기 위한 값이다.
 * 현장 데이터로 맞춘 값이 아니라 시뮬레이터 시나리오(30초 간격)와 겹침 잡음 가정에서 정한 초기값이다.
 */
export const REPEATED_MIN_GAP_SECONDS = 15

/** 이 시간 창 안에 구역이 바뀐 횟수가 기준 이상이면 알린다. 민감도가 높을수록 적은 횟수로 알린다. (서버 규칙과 설정 화면의 설명이 같은 값을 쓴다) */
export const REPEATED_THRESHOLD: Record<Sensitivity, number> = { LOW: 6, MEDIUM: 4, HIGH: 3 }
