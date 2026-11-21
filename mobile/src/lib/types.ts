/** 서버(apps/server) 응답 중 앱이 쓰는 부분. 서버의 공유 스키마(packages/shared)와 같은 이름·값이다. */
export type Zone = 'BED_SIDE' | 'PATH' | 'ENTRANCE'
export type Severity = 'INFO' | 'NOTICE' | 'URGENT'
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
export type SensorState = 'PENDING' | 'ONLINE' | 'OFFLINE' | 'DISABLED'
export type Origin = 'REAL' | 'SIMULATED'

export interface Guardian {
  id: string
  email: string
  displayName: string
}

export interface Household {
  id: string
  name: string
}

export interface MobileLogin {
  token: string
  expiresAt: string
  guardian: Guardian
  household: Household
}

export interface Alert {
  id: string
  type: string
  severity: Severity
  status: AlertStatus
  origin: Origin
  title: string
  message: string
  sensorName: string | null
  triggeredAt: string
  lastEventAt: string
  occurrences: number
  acknowledgedAt: string | null
  resolvedAt: string | null
  read?: boolean
}

export interface AlertDetail {
  alert: Alert
  evidence: {
    eventId: string
    sensorName: string
    zone: Zone
    occurredAt: string
    isLate: boolean
  }[]
}

export interface AlertClip {
  id: string
  alertId: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  createdAt: string
  url: string
}

export interface Sensor {
  id: string
  name: string
  zone: Zone
  origin: Origin
  isActive: boolean
  state: SensorState
  lastSeenAt: string | null
  batteryPercent: number | null
}

export interface UnreadCount {
  unread: number
  unreadImportant: number
}

export interface AlertNotify {
  alert: Alert
  reason: string
}
