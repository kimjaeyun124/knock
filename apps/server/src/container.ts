import { INGEST_LIMITS } from '@tetris/shared'
import { LOGIN_FAILURE_WINDOW_MS, LOGIN_MAX_FAILURES } from '@/config/auth'
import type { PrismaClient } from '@/db/client'
import { InAppAdapter } from '@/integrations/notifications/in-app.adapter'
import type { NotificationChannelAdapter } from '@/integrations/notifications/types'
import { UnconfiguredAdapter } from '@/integrations/notifications/unconfigured.adapter'
import { RealtimeGateway } from '@/realtime/gateway'
import { AlertPipeline } from '@/services/alert-pipeline.service'
import { AlertPresenter } from '@/services/alert-presenter'
import { AlertService } from '@/services/alert.service'
import { AuthService } from '@/services/auth.service'
import { AlertClipService } from '@/services/alert-clip.service'
import { BackupService } from '@/services/backup.service'
import { ChannelService } from '@/services/channel.service'
import { PushService } from '@/services/push.service'
import { WebPushAdapter, type PushSender } from '@/integrations/notifications/web-push.adapter'
import { LibraryPushSender, type VapidConfig } from '@/integrations/notifications/web-push.sender'
import { DataService } from '@/services/data.service'
import { FaultInjector } from '@/services/fault-injector'
import { FaultInjectingAdapter } from '@/integrations/notifications/fault-injecting.adapter'
import { SimulatorService } from '@/services/simulator.service'
import { DeviceAuthService } from '@/services/device-auth.service'
import { EventService } from '@/services/event.service'
import { TimelineService } from '@/services/timeline.service'
import { HealthService } from '@/services/health.service'
import { HouseholdService } from '@/services/household.service'
import { IngestService } from '@/services/ingest.service'
import { MaintenanceService } from '@/services/maintenance.service'
import { NotificationService } from '@/services/notification.service'
import { SensorService } from '@/services/sensor.service'
import { SessionService } from '@/services/session.service'
import { CareRecipientRepository } from '@/repositories/care-recipient.repository'
import { CareRecipientService } from '@/services/care-recipient.service'
import { DashboardService } from '@/services/dashboard.service'
import { MonitoringStatusService } from '@/services/monitoring-status.service'
import { SettingsService } from '@/services/settings.service'
import { WatchNotificationAdapter } from '@/integrations/notifications/watch.adapter'
import {
  SensorAdapterRegistry,
  SensorEventGateway,
  SimulatorSensorAdapter,
  UnconfiguredHardwareAdapter,
} from '@/integrations/sensors'
import { LoginThrottle } from '@/utils/login-throttle'
import type { Logger } from '@/utils/logger'
import { RateLimiter } from '@/utils/rate-limiter'

export interface Services {
  health: HealthService
  sessions: SessionService
  auth: AuthService
  settings: SettingsService
  household: HouseholdService
  data: DataService
  push: PushService
  channels: ChannelService
  /** 시뮬레이터가 꺼져 있으면(SIMULATOR_ENABLED=false) null. 경로와 장애 주입이 모두 없다. */
  simulator: SimulatorService | null
  sensors: SensorService
  deviceAuth: DeviceAuthService
  ingest: IngestService
  /** 어댑터(시뮬레이터·실제 하드웨어)가 들여보낸 표준 이벤트를 수집 서비스로 넣는 입구 */
  sensorGateway: SensorEventGateway
  /** 센서 어댑터 목록과 연결 상태. 실제 하드웨어가 없으면 "연결된 장치 없음"이다. */
  sensorAdapters: SensorAdapterRegistry
  /** 자동 데이터베이스 백업. 설정하지 않았으면 null */
  backup: BackupService | null
  /** 알림에 붙는 짧은 영상(시연용 웹캠) */
  clips: AlertClipService
  events: EventService
  dashboard: DashboardService
  monitoring: MonitoringStatusService
  careRecipients: CareRecipientService
  timeline: TimelineService
  realtime: RealtimeGateway
  notifications: NotificationService
  alerts: AlertService
  pipeline: AlertPipeline
  maintenance: MaintenanceService
}

/** 서비스 조립. 시계(now)를 주입할 수 있어 시간에 의존하는 로직을 테스트하기 쉽다. */
export function createServices(options: {
  prisma: PrismaClient
  logger: Logger
  now?: () => Date
  startedAtMs?: number
  /** 알림 전달 채널. 지정하지 않으면 앱 화면(실연동) + 나머지 채널(연동 안 됨). 테스트가 장애를 주입할 때 쓴다. */
  adapters?: (gateway: RealtimeGateway) => NotificationChannelAdapter[]
  /** 브라우저 푸시용 VAPID 설정. 없으면 푸시 채널은 "연동되지 않음"이다. */
  vapid?: VapidConfig | null
  /** 푸시를 실제로 보내는 부분. 테스트에서 가짜로 바꾼다. 기본은 web-push 라이브러리. */
  pushSender?: PushSender
  /** 센서 시뮬레이터를 쓸지. 기본은 끔. */
  simulatorEnabled?: boolean
  /** 자동 데이터베이스 백업. 지정하지 않으면 이 서버는 백업하지 않는다. */
  backup?: { dir: string; keep: number; intervalHours: number }
  /** 시뮬레이터가 신호를 보낼 수집 API 주소. 서버가 열린 뒤 setIngestBaseUrl 로 바꿀 수 있다. */
  ingestBaseUrl?: string
  /** 시뮬레이터의 대기 함수. 테스트에서 기다리는 시간을 없앨 때 쓴다. */
  simulatorSleep?: (ms: number, signal: AbortSignal) => Promise<void>
}): Services {
  const { prisma, logger } = options
  const now = options.now ?? (() => new Date())
  const startedAtMs = options.startedAtMs ?? now().getTime()

  const sessions = new SessionService(prisma, now)
  const throttle = new LoginThrottle(now, LOGIN_MAX_FAILURES, LOGIN_FAILURE_WINDOW_MS)
  const settings = new SettingsService(prisma)
  const sensors = new SensorService(prisma, settings, now)

  const deviceAuth = new DeviceAuthService(
    sensors,
    new RateLimiter(now, INGEST_LIMITS.requestsPerMinutePerSensor, 60_000),
  )

  const realtime = new RealtimeGateway()
  const faults = new FaultInjector(now)
  // 시뮬레이터가 켜져 있을 때만 앱 화면 알림 어댑터에 장애 주입을 붙인다. (시뮬레이션 알림에만 적용)
  const inApp = options.simulatorEnabled
    ? new FaultInjectingAdapter(new InAppAdapter(realtime), faults)
    : new InAppAdapter(realtime)
  // 브라우저 푸시는 VAPID 키가 설정된 때만 실제 연동이다. 아니면 보낸 척하지 않고 "연동되지 않음"이다.
  const webPush = options.vapid
    ? new WebPushAdapter(prisma, options.pushSender ?? new LibraryPushSender(options.vapid), logger)
    : new UnconfiguredAdapter('WEB_PUSH')
  const adapters = options.adapters?.(realtime) ?? [
    inApp,
    webPush,
    new WatchNotificationAdapter(),
    new UnconfiguredAdapter('SMS'),
    new UnconfiguredAdapter('KAKAO'),
  ]
  const presenter = new AlertPresenter(prisma)
  const notifications = new NotificationService(prisma, adapters, realtime, presenter, now, logger)
  const alerts = new AlertService(prisma, settings, notifications, presenter, realtime, now)
  const pipeline = new AlertPipeline(prisma, settings, alerts, sensors, realtime, now, logger)
  const clips = new AlertClipService(prisma, now)
  const maintenance = new MaintenanceService(
    prisma,
    settings,
    pipeline,
    alerts,
    notifications,
    now,
    logger,
    clips,
  )
  const ingest = new IngestService(prisma, settings, now, logger)

  // 수신 후처리 연결: 화면 갱신 → 규칙 판단. (화면 갱신이 규칙 판단의 실패에 영향받지 않게 따로 등록)
  ingest.onEventsAccepted((batch) => {
    for (const event of batch.events) {
      realtime.emitToHousehold(batch.sensor.householdId, 'event.created', {
        event: {
          id: event.id,
          sensorId: event.sensorId,
          sensorName: batch.sensor.name,
          zone: event.zone,
          origin: event.origin,
          occurredAt: event.occurredAt.toISOString(),
          receivedAt: event.receivedAt.toISOString(),
          isLate: event.isLate,
        },
      })
    }
  })
  ingest.onEventsAccepted((batch) => pipeline.handleEvents(batch))
  ingest.onSensorStatusChange(async (change) => {
    realtime.emitToHousehold(change.sensor.householdId, 'sensor.status', {
      sensor: await sensors.present(change.sensor),
      change: change.kind,
    })
    // 연결·배터리 상태가 바뀌면 모니터링 상태 요약도 새로 알린다.
    await monitoring.publish(change.sensor.householdId)
  })
  // 신호가 없어 연결 끊김을 찾아낸 경우(주기 점검)에도 같다.
  pipeline.setMonitoringChangedListener((householdId) => monitoring.publish(householdId))
  ingest.onSensorStatusChange((change) => pipeline.handleSensorStatus(change))
  notifications.onAllDeliveriesFailed((alert) => pipeline.handleDeliveryExhausted(alert))

  const adapterOptions = { now, logger }
  const sensorGateway = new SensorEventGateway(prisma, ingest, now, logger)
  const sensorAdapters = new SensorAdapterRegistry([
    ...(options.simulatorEnabled ? [new SimulatorSensorAdapter(adapterOptions)] : []),
    // 실제 하드웨어와 통신 방식이 정해지지 않아 자리만 있다. 항상 "연결된 장치 없음"으로 보고한다.
    new UnconfiguredHardwareAdapter(adapterOptions),
  ])

  const data = new DataService(prisma)
  const events = new EventService(prisma, now)
  const monitoring = new MonitoringStatusService(settings, sensors, realtime, now)
  sensors.setChangedListener((householdId) => void monitoring.publish(householdId))
  const push = new PushService(prisma, options.vapid?.publicKey ?? null)
  const channels = new ChannelService(prisma, adapters, now)
  const simulator = options.simulatorEnabled
    ? new SimulatorService({
        prisma,
        sensors,
        settings,
        faults,
        now,
        logger,
        ingestBaseUrl: options.ingestBaseUrl ?? 'http://127.0.0.1:4000',
        checkConnections: () => pipeline.checkSensorConnections(),
        ...(options.simulatorSleep ? { sleep: options.simulatorSleep } : {}),
      })
    : null
  data.onSimulatedDeleted((householdId) => simulator?.forget(householdId))

  return {
    health: new HealthService(
      async () => {
        await prisma.$queryRaw`SELECT 1`
      },
      startedAtMs,
      now,
    ),
    sessions,
    auth: new AuthService(prisma, sessions, throttle),
    settings,
    household: new HouseholdService(prisma, now),
    data,
    push,
    channels,
    simulator,
    sensors,
    deviceAuth,
    ingest,
    sensorGateway,
    sensorAdapters,
    backup: options.backup ? new BackupService({ prisma, logger, now, ...options.backup }) : null,
    clips,
    events,
    monitoring,
    dashboard: new DashboardService(sensors, events, alerts, settings, now),
    careRecipients: new CareRecipientService(new CareRecipientRepository(prisma)),
    timeline: new TimelineService(prisma, settings),
    realtime,
    notifications,
    alerts,
    pipeline,
    maintenance,
  }
}
