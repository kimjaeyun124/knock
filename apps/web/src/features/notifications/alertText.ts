import type { Alert } from '@tetris/shared'
import { ALERT_STATUS_LABELS, RESOLUTION_LABELS } from '@/lib/labels'

/** 전달 결과를 한 줄로. 실패와 연동되지 않음을 숨기지 않는다. */
export function deliverySummaryText(alert: Alert): string {
  const { sent, pending, failed, notConfigured } = alert.delivery
  const parts: string[] = []
  if (sent > 0) parts.push(`전달됨 ${sent}`)
  if (pending > 0) parts.push(`전달 대기 ${pending}`)
  if (failed > 0) parts.push(`전달 실패 ${failed}`)
  if (notConfigured > 0) parts.push(`연동되지 않은 채널 ${notConfigured}`)
  return parts.length > 0 ? parts.join(' · ') : '전달 기록 없음'
}

export function statusText(alert: Alert): string {
  if (alert.status === 'RESOLVED' && alert.resolution) {
    return `종료 (${RESOLUTION_LABELS[alert.resolution]})`
  }
  return ALERT_STATUS_LABELS[alert.status]
}
