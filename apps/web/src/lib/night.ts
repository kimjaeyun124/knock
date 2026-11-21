import { WEEKDAY_LABELS } from '@tetris/shared'
import { formatTimeOfDay } from './format'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function minutesOf(hhmm: string): number {
  const [hour = 0, minute = 0] = hhmm.split(':').map(Number)
  return hour * 60 + minute
}

/**
 * 지금(한국 시간)이 야간 모니터링 시간대인가. 시작은 포함, 종료는 제외한다.
 * 종료가 시작보다 이르면 자정을 넘는 구간이다. (예: 22:00 ~ 06:00)
 * 서버의 규칙 엔진(apps/server/src/domain/time.ts)과 같은 기준이다.
 */
export function isNightTime(date: Date, nightStart: string, nightEnd: string): boolean {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  const start = minutesOf(nightStart)
  const end = minutesOf(nightEnd)
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

export interface MonitoringSchedule {
  monitoringEnabled: boolean
  /** 0=월 … 6=일. 야간 구간이 시작되는 날 기준 */
  activeWeekdays: readonly number[]
  nightStart: string
  nightEnd: string
}

/** 한국 시각 기준 요일. 0=월 … 6=일 */
function weekdayKst(date: Date): number {
  return (new Date(date.getTime() + KST_OFFSET_MS).getUTCDay() + 6) % 7
}

/**
 * 지금 움직임 알림을 판단하는 시간인가. 서버(apps/server/src/domain/time.ts 의 isMonitoredTime)와 같은 기준이다.
 * 모니터링이 켜져 있고, 야간 시간대이며, 그 야간 구간이 시작된 요일이 일정에 들어 있어야 한다.
 */
export function isMonitoredNow(date: Date, schedule: MonitoringSchedule): boolean {
  if (!schedule.monitoringEnabled) return false
  if (!isNightTime(date, schedule.nightStart, schedule.nightEnd)) return false
  const start = minutesOf(schedule.nightStart)
  const end = minutesOf(schedule.nightEnd)
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  const today = weekdayKst(date)
  const startedOn = start > end && minutes < end ? (today + 6) % 7 : today
  return schedule.activeWeekdays.includes(startedOn)
}

/** "매일" / "평일"(월~금) / "주말" / "월·수·금" */
export function describeWeekdays(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return '매일'
  if (sorted.length === 0) return '요일 없음'
  if (sorted.join() === '0,1,2,3,4') return '평일(월~금)'
  if (sorted.join() === '5,6') return '주말(토·일)'
  return sorted.map((day) => WEEKDAY_LABELS[day]).join('·')
}

/** "매일 오후 10:00 ~ 오전 6:00" */
export function describeSchedule(
  nightStart: string,
  nightEnd: string,
  weekdays: readonly number[] = [0, 1, 2, 3, 4, 5, 6],
): string {
  return `${describeWeekdays(weekdays)} ${formatTimeOfDay(nightStart)} ~ ${formatTimeOfDay(nightEnd)}`
}
