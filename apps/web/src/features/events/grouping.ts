import type { TimelineEvent } from '@tetris/shared'
import { localDateKey } from '@/lib/localTime'

export interface DayGroup {
  /** 로컬 날짜 (YYYY-MM-DD) */
  date: string
  events: TimelineEvent[]
}

/** 정렬된 이벤트를 로컬 날짜별로 묶는다. 순서는 그대로 유지한다. */
export function groupByLocalDate(events: readonly TimelineEvent[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const date = localDateKey(event.occurredAt)
    const last = groups.at(-1)
    if (last?.date === date) last.events.push(event)
    else groups.push({ date, events: [event] })
  }
  return groups
}
