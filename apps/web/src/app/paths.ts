/**
 * 화면 경로와 화면 이름의 유일한 출처.
 * 메뉴·링크·경로 정의·문서 제목이 모두 여기 값을 쓰므로, 경로나 이름을 바꿀 때 이 파일만 고치면 된다.
 */

export const PATHS = {
  dashboard: '/',
  sensors: '/sensors',
  sensorNew: '/sensors/new',
  sensorDetail: (sensorId: string) => `/sensors/${encodeURIComponent(sensorId)}`,
  events: '/events',
  notifications: '/notifications',
  notificationDetail: (alertId: string) => `/notifications/${encodeURIComponent(alertId)}`,
  settings: '/settings',
  settingsDetection: '/settings/detection',
  settingsNotifications: '/settings/notifications',
  settingsIntegrations: '/settings/integrations',
  settingsData: '/settings/data',
  settingsPassword: '/settings/password',
  settingsGuide: '/settings/guide',
  onboarding: '/onboarding',
  notice: '/notice',
  login: '/login',
  register: '/register',
  devDesign: '/dev/design',
  devSimulator: '/dev/simulator',
  devWebcam: '/dev/webcam',
} as const

/** 예전에 쓰던 경로. 이미 보낸 푸시 알림·북마크가 계속 열리도록 새 경로로 넘겨 준다. */
export const LEGACY_PATHS = {
  alerts: 'alerts',
  history: 'history',
  setup: 'setup',
} as const

export const PAGE_TITLES = {
  dashboard: '대시보드',
  sensors: '센서 관리',
  sensorNew: '센서 등록',
  sensorDetail: '센서 상세',
  events: '움직임 기록',
  notifications: '알림 센터',
  notificationDetail: '알림 상세',
  settings: '설정',
  settingsDetection: '감지 시간·민감도',
  settingsNotifications: '알림 채널',
  settingsIntegrations: '연동 현황',
  settingsData: '데이터 관리',
  settingsPassword: '비밀번호 변경',
  settingsGuide: '감지 안내',
  onboarding: '초기 설정',
  notice: '서비스 안내와 한계',
  devDesign: '디자인 시스템',
  devSimulator: '센서 시뮬레이터',
  devWebcam: '웹캠 움직임 감지',
  notFound: '페이지를 찾을 수 없습니다',
} as const

export const SERVICE_NAME = '노크'
