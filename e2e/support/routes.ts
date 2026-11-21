import { expect, type APIRequestContext } from '@playwright/test'

export interface ScreenRoute {
  name: string
  path: string
  /** 화면이 다 그려졌음을 알려 주는 제목 */
  heading: string
}

/** 테스트 데이터(시뮬레이션 센서·알림)를 만든 뒤 화면 경로 목록을 돌려준다. */
export async function listScreenRoutes(api: APIRequestContext): Promise<ScreenRoute[]> {
  const sensors = (await (await api.get('/api/sensors')).json()) as { sensors: { id: string }[] }
  const alerts = (await (await api.get('/api/alerts')).json()) as { alerts: { id: string }[] }
  const sensorId = sensors.sensors[0]?.id
  const alertId = alerts.alerts[0]?.id
  expect(sensorId, '시뮬레이션 센서가 필요합니다.').toBeTruthy()
  expect(alertId, '알림이 필요합니다.').toBeTruthy()
  return [
    { name: '대시보드', path: '/', heading: '대시보드' },
    { name: '알림 센터', path: '/notifications', heading: '알림 센터' },
    { name: '알림 상세', path: `/notifications/${alertId}`, heading: '알림 상세' },
    { name: '움직임 기록', path: '/events', heading: '움직임 기록' },
    { name: '센서 관리', path: '/sensors', heading: '센서 관리' },
    { name: '센서 등록', path: '/sensors/new', heading: '센서 등록' },
    { name: '센서 상세', path: `/sensors/${sensorId}`, heading: '센서 상세' },
    { name: '설정', path: '/settings', heading: '설정' },
    { name: '감지 설정', path: '/settings/detection', heading: '감지 시간·민감도' },
    { name: '알림 채널', path: '/settings/notifications', heading: '알림 채널' },
    { name: '연동 현황', path: '/settings/integrations', heading: '연동 현황' },
    { name: '감지 안내', path: '/settings/guide', heading: '감지 안내' },
    { name: '비밀번호 변경', path: '/settings/password', heading: '비밀번호 변경' },
    { name: '데이터 관리', path: '/settings/data', heading: '데이터 관리' },
    { name: '디자인 시스템', path: '/dev/design', heading: '디자인 시스템' },
    { name: '웹캠 움직임 감지', path: '/dev/webcam', heading: '웹캠 움직임 감지' },
    { name: '시뮬레이터', path: '/dev/simulator', heading: '센서 시뮬레이터' },
    { name: '초기 설정', path: '/onboarding', heading: '초기 설정' },
  ]
}
