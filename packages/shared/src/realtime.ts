import { z } from './zod'
import { AlertDeliverySchema, AlertSchema } from './alerts'
import { SensorStatusLogKindSchema } from './domain'
import { MovementEventSchema } from './events'
import { SensorSchema } from './sensors'
import { DetectionSettingsSchema } from './settings'

export const ServerReadyPayloadSchema = z.object({
  serverTime: z.iso.datetime(),
})

export type ServerReadyPayload = z.infer<typeof ServerReadyPayloadSchema>

export const AlertNotifyReasonSchema = z.enum(['NEW', 'ESCALATED', 'REMINDER'])
export type AlertNotifyReason = z.infer<typeof AlertNotifyReasonSchema>

/** 같은 가구의 모든 화면이 받는 데이터 갱신 이벤트 */
export const EventCreatedPayloadSchema = z.object({ event: MovementEventSchema })
export const AlertPayloadSchema = z.object({ alert: AlertSchema })
export const SensorStatusPayloadSchema = z.object({
  sensor: SensorSchema,
  /** 무엇이 바뀌었는지 */
  change: SensorStatusLogKindSchema,
})
export const DeliveryUpdatedPayloadSchema = z.object({
  alertId: z.string(),
  delivery: AlertDeliverySchema,
})
/**
 * 이 보호자가 알림을 읽음 처리했다. 같은 보호자의 다른 화면(기기)만 받는다. (읽음은 보호자마다 따로다)
 * all 이 true 면 "모두 읽음"이라 alertIds 는 비어 있다.
 */
export const AlertReadPayloadSchema = z.object({
  alertIds: z.array(z.string()),
  all: z.boolean(),
})
export const SettingsUpdatedPayloadSchema = z.object({ settings: DetectionSettingsSchema })

/**
 * 모니터링 상태 요약. 모니터링 설정이나 센서의 연결·사용 여부가 바뀔 때 같은 가구의 모든 화면에 알린다.
 * 화면은 이 값을 "바뀌었다"는 신호로 쓰고 자세한 내용은 REST 로 다시 읽는다.
 */
export const MonitoringStatusSchema = z.object({
  /** 모니터링 사용 여부 */
  enabled: z.boolean(),
  activeWeekdays: z.array(z.number().int().min(0).max(6)),
  nightStart: z.string(),
  nightEnd: z.string(),
  /** 이 값을 만든 시점이 알림을 판단하는 시간(켜짐·야간·요일 일정)인가 */
  monitoredNow: z.boolean(),
  /** 사용 중인 센서 수 */
  activeSensors: z.number().int().nonnegative(),
  /** 그중 지금 연결되어 있는 센서 수 */
  connectedSensors: z.number().int().nonnegative(),
  evaluatedAt: z.iso.datetime(),
})
export type MonitoringStatus = z.infer<typeof MonitoringStatusSchema>
export const MonitoringStatusPayloadSchema = z.object({ monitoring: MonitoringStatusSchema })
export type MonitoringStatusPayload = z.infer<typeof MonitoringStatusPayloadSchema>

/**
 * 알림 전달용 이벤트. 해당 보호자의 열려 있는 화면에만 간다.
 * 화면은 이 이벤트를 받으면 소리·배너로 알린다. (앱 화면이 열려 있을 때만 동작하는 채널)
 */
export const AlertNotifyPayloadSchema = z.object({
  alert: AlertSchema,
  reason: AlertNotifyReasonSchema,
})

/** 알림 채널 테스트 발송. 앱 화면 알림 채널이 이 이벤트로 "화면까지 도착했다"는 것을 확인한다. */
export const NotificationTestPayloadSchema = z.object({ sentAt: z.iso.datetime() })
export type NotificationTestPayload = z.infer<typeof NotificationTestPayloadSchema>

export type EventCreatedPayload = z.infer<typeof EventCreatedPayloadSchema>
export type AlertPayload = z.infer<typeof AlertPayloadSchema>
export type SensorStatusPayload = z.infer<typeof SensorStatusPayloadSchema>
export type DeliveryUpdatedPayload = z.infer<typeof DeliveryUpdatedPayloadSchema>
export type AlertReadPayload = z.infer<typeof AlertReadPayloadSchema>
export type SettingsUpdatedPayload = z.infer<typeof SettingsUpdatedPayloadSchema>
export type AlertNotifyPayload = z.infer<typeof AlertNotifyPayloadSchema>

/**
 * 서버 → 클라이언트 Socket.IO 이벤트.
 * 소켓 메시지는 "화면을 빨리 갱신하기 위한 알림"이다. 끊겼다 다시 연결되면
 * 화면은 REST 로 목록을 다시 가져와 놓친 것을 보충해야 한다.
 */
export interface ServerToClientEvents {
  'server:ready': (payload: ServerReadyPayload) => void
  'event.created': (payload: EventCreatedPayload) => void
  'alert.created': (payload: AlertPayload) => void
  'alert.updated': (payload: AlertPayload) => void
  'alert.notify': (payload: AlertNotifyPayload) => void
  'alert.read': (payload: AlertReadPayload) => void
  'notification.test': (payload: NotificationTestPayload) => void
  'sensor.status': (payload: SensorStatusPayload) => void
  'delivery.updated': (payload: DeliveryUpdatedPayload) => void
  'settings.updated': (payload: SettingsUpdatedPayload) => void
  'monitoring.status': (payload: MonitoringStatusPayload) => void
}

/** 클라이언트 → 서버 이벤트. 아직 없음. */
export type ClientToServerEvents = Record<never, never>
