import type { Alert, Sensor } from './types'
import type { Tone } from '../theme'

export interface OverallStatus {
  tone: Tone
  label: string
  headline: string
  /** 대표 알림 (있으면 상세로 이어 준다) */
  alertId: string | null
}

/**
 * 첫 화면의 큰 상태. 센서 신호와 열린 알림만으로 정하며, 어르신이 괜찮다는 뜻이 아니다.
 * 우선순위: 연결 확인 불가 > 즉시 확인 권장 > 확인 필요 > 연결 끊긴 센서 > 센서 없음 > 모니터링 중
 */
export function deriveOverallStatus(input: {
  alerts: readonly Alert[] | null
  sensors: readonly Sensor[] | null
  connected: boolean
}): OverallStatus {
  if (!input.alerts || !input.sensors) {
    return {
      tone: 'muted',
      label: '상태 확인 불가',
      headline: '서버에서 정보를 받지 못해 지금 상태를 알 수 없습니다',
      alertId: null,
    }
  }
  const open = input.alerts.filter((a) => a.status === 'OPEN')
  const urgent = open.find((a) => a.severity === 'URGENT')
  if (urgent) {
    return { tone: 'danger', label: '즉시 확인 권장', headline: urgent.title, alertId: urgent.id }
  }
  const notice = open.find((a) => a.severity === 'NOTICE')
  if (notice) {
    return { tone: 'warn', label: '확인 필요', headline: notice.title, alertId: notice.id }
  }
  const active = input.sensors.filter((s) => s.isActive)
  const offline = active.filter((s) => s.state === 'OFFLINE')
  if (offline.length > 0) {
    return {
      tone: 'warn',
      label: '모니터링 불완전',
      headline: `연결이 끊긴 센서가 ${offline.length}개 있습니다. 그 구역의 움직임은 지금 확인되지 않습니다`,
      alertId: null,
    }
  }
  if (active.length === 0) {
    return {
      tone: 'muted',
      label: '센서 없음',
      headline: '사용 중인 센서가 없어 움직임을 알 수 없습니다',
      alertId: null,
    }
  }
  return {
    tone: 'ok',
    label: '모니터링 중',
    headline: input.connected
      ? '최근 확인이 필요한 움직임이 없습니다'
      : '최근 확인이 필요한 움직임이 없습니다 (실시간 연결은 다시 시도하는 중)',
    alertId: null,
  }
}
