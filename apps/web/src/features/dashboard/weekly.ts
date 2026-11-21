import type { DailySummaryDay } from '@tetris/shared'

/** 기록이 하나도 없는지. 모든 날이 0건이면 그래프 대신 빈 상태를 보여 준다. */
export function isWeeklyEmpty(days: readonly DailySummaryDay[]): boolean {
  return days.every((day) => day.movements === 0 && day.attentionAlerts === 0)
}
