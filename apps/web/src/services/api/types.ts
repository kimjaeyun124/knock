import type {
  AlertDetail,
  AlertPreferences,
  AlertPreferencesInput,
  AlertResolveRequest,
  AlertResponse,
  AlertListResponse,
  AlertReadAllResponse,
  AlertUnreadCountResponse,
  AlertStatus,
  AlertsQuery,
  AuthSessionResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  Channel,
  ChannelTestResponse,
  DailySummaryResponse,
  DashboardSummary,
  DataSummaryResponse,
  DeleteSimulatedResponse,
  DetectionSettings,
  DetectionSettingsInput,
  EventsQuery,
  FeaturesResponse,
  AlertClipUploadResponse,
  AlertClipsResponse,
  BackupStatus,
  SensorAdaptersResponse,
  EventsResponse,
  HealthResponse,
  HouseholdResponse,
  HouseholdUpdate,
  IntegrationsResponse,
  LoginRequest,
  PushConfigResponse,
  PushSubscribeResponse,
  PushSubscriptionInput,
  PushSubscriptionsResponse,
  RegisterRequest,
  SetupStatusResponse,
  SensorCreate,
  SensorDeleteResponse,
  SensorListResponse,
  SensorResponse,
  SensorUpdate,
  SensorWithTokenResponse,
  SimulatorMotionRequest,
  SimulatorSpeed,
  SimulatorState,
  TimelineDetailResponse,
  TimelineFilter,
  TimelineQuery,
  TimelineResponse,
  TimelineSummaryResponse,
  ZoneKind,
} from '@tetris/shared'

/** 알림 목록 조건. 상태는 배열로 받아 요청할 때 쉼표로 이어 보낸다. */
export type AlertListFilter = Omit<AlertsQuery, 'status'> & {
  status?: readonly AlertStatus[]
}

export interface HealthApi {
  get(signal?: AbortSignal): Promise<HealthResponse>
}

export interface AuthApi {
  /** 로그인되어 있지 않으면 null. 확인 자체에 실패하면 오류를 던진다. */
  session(signal?: AbortSignal): Promise<AuthSessionResponse | null>
  login(input: LoginRequest): Promise<AuthSessionResponse>
  /** 서버에 보호자가 없을 때만 성공한다. 성공하면 로그인된 상태가 된다. */
  register(input: RegisterRequest): Promise<AuthSessionResponse>
  setupStatus(signal?: AbortSignal): Promise<SetupStatusResponse>
  logout(): Promise<void>
  /** 현재 비밀번호를 확인하고 바꾼다. 이 기기는 로그인된 채로 남고 다른 기기는 로그아웃된다. */
  changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse>
}

export interface HouseholdApi {
  get(signal?: AbortSignal): Promise<HouseholdResponse>
  update(input: HouseholdUpdate): Promise<HouseholdResponse>
}

export interface SettingsApi {
  getDetection(signal?: AbortSignal): Promise<DetectionSettings>
  updateDetection(input: DetectionSettingsInput): Promise<DetectionSettings>
  getAlertPreferences(signal?: AbortSignal): Promise<AlertPreferences>
  updateAlertPreferences(input: AlertPreferencesInput): Promise<AlertPreferences>
}

export interface SensorsApi {
  list(signal?: AbortSignal): Promise<SensorListResponse>
  get(id: string, signal?: AbortSignal): Promise<SensorResponse>
  create(input: SensorCreate): Promise<SensorWithTokenResponse>
  update(id: string, input: SensorUpdate): Promise<SensorResponse>
  /** 새 장치 토큰은 이 응답에서 한 번만 받을 수 있다. */
  rotateToken(id: string): Promise<SensorWithTokenResponse>
  remove(id: string): Promise<SensorDeleteResponse>
}

export interface EventsApi {
  list(query: EventsQuery, signal?: AbortSignal): Promise<EventsResponse>
  /** 오늘(한국 시간)을 포함한 최근 N일의 날짜별 움직임 신호 수·주의 알림 수 */
  daily(days: number, signal?: AbortSignal): Promise<DailySummaryResponse>
}

/** 움직임 기록(타임라인): 움직임 신호와 센서 상태 변화를 시간순으로 합친 기록 */
export interface TimelineApi {
  list(query: TimelineQuery, signal?: AbortSignal): Promise<TimelineResponse>
  /** 같은 조건 전체(한 쪽이 아니라)의 건수와 최근 시각 */
  summary(filter: TimelineFilter, signal?: AbortSignal): Promise<TimelineSummaryResponse>
  get(id: string, signal?: AbortSignal): Promise<TimelineDetailResponse>
}

/**
 * 대시보드 한 화면에 필요한 데이터를 한 번에 가져오는 계층.
 * 실제 구현은 GET /api/v1/dashboard/summary 한 번을 부르고, 개발 중에는 Mock 으로 바꿔 쓸 수 있다.
 */
export interface DashboardApi {
  summary(signal?: AbortSignal): Promise<DashboardSummary>
}

export interface AlertsApi {
  list(filter: AlertListFilter, signal?: AbortSignal): Promise<AlertListResponse>
  get(id: string, signal?: AbortSignal): Promise<AlertDetail>
  acknowledge(id: string): Promise<AlertResponse>
  resolve(id: string, input: AlertResolveRequest): Promise<AlertResponse>
  /** 내가 읽지 않은 알림 수 (처리 상태와 상관없이) */
  unreadCount(signal?: AbortSignal): Promise<AlertUnreadCountResponse>
  /** 알림 하나를 읽음으로 표시한다. 처리 상태(확인·종료)는 바뀌지 않는다. */
  markRead(id: string): Promise<AlertResponse>
  /** 모든 알림을 읽음으로 표시한다. 처리 상태는 바뀌지 않는다. */
  markAllRead(): Promise<AlertReadAllResponse>
  /** 알림에 붙은 영상 목록 (시연용 웹캠) */
  clips(id: string, signal?: AbortSignal): Promise<AlertClipsResponse>
}

export interface IntegrationsApi {
  list(signal?: AbortSignal): Promise<IntegrationsResponse>
}

export interface NotificationsApi {
  /** 지금 로그인한 보호자에게 테스트를 보낸다. 알림이나 전달 기록은 만들지 않는다. */
  test(channel: Channel): Promise<ChannelTestResponse>
}

export interface PushApi {
  config(signal?: AbortSignal): Promise<PushConfigResponse>
  list(signal?: AbortSignal): Promise<PushSubscriptionsResponse>
  subscribe(input: PushSubscriptionInput): Promise<PushSubscribeResponse>
  remove(id: string): Promise<void>
}

export interface SystemApi {
  features(signal?: AbortSignal): Promise<FeaturesResponse>
  /** 센서 어댑터(시뮬레이터·실제 하드웨어)의 연결 상태 */
  sensorAdapters(signal?: AbortSignal): Promise<SensorAdaptersResponse>
  /** 서버의 자동 데이터베이스 백업 상태 */
  backupStatus(signal?: AbortSignal): Promise<BackupStatus>
}

export interface DataApi {
  summary(signal?: AbortSignal): Promise<DataSummaryResponse>
  /** 시뮬레이션 데이터만 지운다. 실제 데이터는 그대로다. */
  deleteSimulated(): Promise<DeleteSimulatedResponse>
}

/** 개발·시연용 시뮬레이터. 서버의 SIMULATOR_ENABLED 가 꺼져 있으면 모두 404 이다. */
export type SimulatorMotionOptions = Pick<SimulatorMotionRequest, 'mode' | 'count' | 'when'>

export interface SimulatorApi {
  state(signal?: AbortSignal): Promise<SimulatorState>
  /** zone 을 주면 그 구역의 센서만, 아니면 세 구역 모두 만든다. */
  ensureSensors(zone?: ZoneKind): Promise<SimulatorState>
  /** 구역의 시뮬레이션 센서를 연결 해제(삭제)한다. */
  removeSensor(zone: ZoneKind): Promise<SimulatorState>
  motion(zone: ZoneKind, options?: SimulatorMotionOptions): Promise<SimulatorState>
  setBattery(zone: ZoneKind, batteryPercent: number): Promise<SimulatorState>
  /** fastForward: 신호가 오래 없었던 것처럼 처리하고 연결 점검을 바로 실행한다. (끊을 때만) */
  setSilenced(zone: ZoneKind, silenced: boolean, fastForward?: boolean): Promise<SimulatorState>
  setDeliveryFailure(enabled: boolean): Promise<SimulatorState>
  runScenario(id: string, speed: SimulatorSpeed): Promise<SimulatorState>
  stopScenario(): Promise<SimulatorState>
  /** 알림이 만들어진 순간의 짧은 영상을 그 알림에 붙인다. (시연용 웹캠) */
  uploadClip(alertId: string, video: Blob, durationMs: number): Promise<AlertClipUploadResponse>
}

/**
 * 화면이 서버와 주고받는 모든 기능. 기능 단위로 구현을 고를 수 있다.
 * - 실제 서버(HttpApiClient)가 기본이다.
 * - 서버에 아직 없는 기능은 개발 중에만 Mock 구현으로 바꿔 쓸 수 있다. (features.ts)
 */
export interface ApiClient {
  health: HealthApi
  auth: AuthApi
  household: HouseholdApi
  settings: SettingsApi
  sensors: SensorsApi
  events: EventsApi
  alerts: AlertsApi
  dashboard: DashboardApi
  timeline: TimelineApi
  integrations: IntegrationsApi
  notifications: NotificationsApi
  push: PushApi
  system: SystemApi
  data: DataApi
  simulator: SimulatorApi
}

/**
 * Mock 응답에는 항상 mock: true 표식이 붙는다. 실제 서버 응답에는 없다.
 * mockSource 는 이 응답을 만든 어댑터를 알려 준다. (운영 번들 검사에도 쓰인다)
 */
export type Mocked<T> = T & { readonly mock: true; readonly mockSource: string }
