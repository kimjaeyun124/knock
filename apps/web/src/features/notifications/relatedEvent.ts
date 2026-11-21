import { PATHS } from '@/app/paths'
import { localDateKey } from '@/lib/localTime'

/**
 * 알림과 관련된 움직임 기록으로 가는 주소. 그 기록의 상세를 열고, 목록은 알림이 생긴 날로 맞춘다.
 * 가리킬 기록이 없으면(예: 전달 실패 알림) null.
 */
export function relatedEventHref(alert: {
  relatedEventIds: readonly string[]
  triggeredAt: string
}): string | null {
  const id = alert.relatedEventIds[0]
  if (!id) return null
  const day = localDateKey(alert.triggeredAt)
  return `${PATHS.events}?event=${encodeURIComponent(id)}&from=${day}&to=${day}`
}
