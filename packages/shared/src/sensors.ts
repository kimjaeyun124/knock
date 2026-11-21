import { z } from './zod'
import {
  BatteryLevelSchema,
  DataOriginSchema,
  SensorKindSchema,
  SensorStateSchema,
  SensitivitySchema,
  ZoneKindSchema,
  type SensorKind,
} from './domain'

/** 연결이 끊긴 채 이만큼(초) 신호가 없으면 "장시간 미응답"으로 따로 알린다. */
export const LONG_SILENT_SECONDS = 60 * 60

/** 데이터 수신 오류를 "최근"으로 보는 시간(초). 이 안에 오류가 있으면 화면이 주의로 표시한다. */
export const RECENT_RECEIVE_ERROR_SECONDS = 60 * 60

/** 한 가구에 등록할 수 있는 센서 수 */
export const MAX_SENSORS_PER_HOUSEHOLD = 20

export const SensorNameSchema = z.string().trim().min(1, '이름을 입력해 주세요.').max(50)

/** 장치 고유 번호(일련번호·MAC 등). 장치를 알아보는 용도이며 인증에는 쓰지 않는다. */
export const DeviceIdSchema = z
  .string()
  .trim()
  .min(1, '장치 번호를 입력해 주세요.')
  .max(100, '장치 번호는 100자 이내로 입력해 주세요.')
  .regex(/^[A-Za-z0-9._:-]+$/, '장치 번호는 영문·숫자와 . _ : - 만 쓸 수 있습니다.')

export const SensorCreateSchema = z.object({
  name: SensorNameSchema,
  zone: ZoneKindSchema,
  /** 선택. 같은 가구 안에서 중복될 수 없다. */
  deviceId: DeviceIdSchema.optional(),
})
export type SensorCreate = z.infer<typeof SensorCreateSchema>

/** 일부 항목만 보낼 수 있다. 하나도 없으면 거부한다. */
export const SensorUpdateSchema = z
  .object({
    name: SensorNameSchema.optional(),
    zone: ZoneKindSchema.optional(),
    isActive: z.boolean().optional(),
    /** 이 센서의 서버 판단 민감도. null 이면 가구 기본 민감도를 따른다. */
    sensitivity: SensitivitySchema.nullable().optional(),
    /** null 이면 장치 번호를 지운다. */
    deviceId: DeviceIdSchema.nullable().optional(),
    /** 이 센서의 연결 끊김 기준(초, 60~3600). null 이면 가구 기본을 따른다. */
    offlineAfterSeconds: z.number().int().min(60).max(3600).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: '바꿀 항목을 하나 이상 보내 주세요.',
  })
export type SensorUpdate = z.infer<typeof SensorUpdateSchema>

export const SensorSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: SensorKindSchema,
  zone: ZoneKindSchema,
  origin: DataOriginSchema,
  isActive: z.boolean(),
  /** 연결 상태. 서버가 마지막 신호 시각과 설정으로 계산해 내려 준다. */
  state: SensorStateSchema,
  /** 마지막으로 신호(움직임·상태 확인)를 받은 시각. 한 번도 없으면 null */
  lastSeenAt: z.iso.datetime().nullable(),
  batteryPercent: z.number().int().nullable(),
  batteryLevel: BatteryLevelSchema,
  firmwareVersion: z.string().nullable(),
  /** 장치 고유 번호. 없으면 null */
  deviceId: z.string().nullable(),
  /** 마지막 heartbeat(상태 보고) 시각. 한 번도 없으면 null. 움직임 신호는 포함하지 않는다. */
  lastHeartbeatAt: z.iso.datetime().nullable(),
  /** 이 센서에만 정한 연결 끊김 기준(초). null 이면 가구 기본을 따른다. */
  offlineAfterSeconds: z.number().int().nullable(),
  /** 실제로 적용되는 연결 끊김 기준(초) — 센서별 값이 있으면 그것, 없으면 가구 기본 */
  effectiveOfflineAfterSeconds: z.number().int(),
  /** 마지막 신호 이후 지난 시간(초). 한 번도 신호가 없으면 null */
  silentSeconds: z.number().int().nonnegative().nullable(),
  /** 연결이 끊긴 채 오래(LONG_SILENT_SECONDS 이상) 신호가 없다. 전원·배터리·설치 상태를 직접 확인해야 할 수준 */
  longSilent: z.boolean(),
  /** 서버가 받지 못한(거부·형식 오류) 데이터 */
  receiveErrors: z.object({
    count: z.number().int().nonnegative(),
    lastAt: z.iso.datetime().nullable(),
    /** 마지막 이유. 예: TOO_OLD · FUTURE_TIMESTAMP · TYPE_MISMATCH · INVALID_PAYLOAD */
    lastReason: z.string().nullable(),
  }),
  /** 이 센서에만 적용하는 서버 판단 민감도. null 이면 가구 기본 민감도를 따른다. */
  sensitivity: SensitivitySchema.nullable(),
  /**
   * 센서 하드웨어 자체의 민감도(감지 감도)를 조절할 수 있는가.
   * false 이면 민감도 설정은 서버가 신호를 해석하는 기준만 바꾸고, 센서의 물리적 감지 감도는 그대로다.
   */
  hardwareSensitivitySupported: z.boolean(),
  createdAt: z.iso.datetime(),
})
export type Sensor = z.infer<typeof SensorSchema>

export const SensorListResponseSchema = z.object({ sensors: z.array(SensorSchema) })
export type SensorListResponse = z.infer<typeof SensorListResponseSchema>

export const SensorResponseSchema = z.object({ sensor: SensorSchema })
export type SensorResponse = z.infer<typeof SensorResponseSchema>

/** 장치 토큰은 발급 직후 이 응답에서 한 번만 받을 수 있다. 이후에는 다시 볼 수 없다. */
export const SensorWithTokenResponseSchema = z.object({
  sensor: SensorSchema,
  deviceToken: z.string(),
})
export type SensorWithTokenResponse = z.infer<typeof SensorWithTokenResponseSchema>

export const SensorDeleteResponseSchema = z.object({
  ok: z.literal(true),
  /** 센서와 함께 지워진 움직임 기록 수 */
  deletedEvents: z.number().int().nonnegative(),
})
export type SensorDeleteResponse = z.infer<typeof SensorDeleteResponseSchema>

/** 센서 종류별로 하드웨어 민감도 조절을 지원하는지. 지금 지원하는 센서(HTTP 로 신호를 보내는 움직임 센서)는 지원하지 않는다. */
export function supportsHardwareSensitivity(_kind: SensorKind): boolean {
  return false
}
