/**
 * 시각 계산. 서비스는 한국에서 쓰이므로 시간대는 Asia/Seoul(UTC+9, 서머타임 없음)로 고정한다.
 * (순수 함수: 시계를 직접 읽지 않고 값을 받는다)
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 한국 시각 기준 자정부터 몇 분이 지났는지 (0~1439) */
export function minutesOfDayKst(date: Date): number {
  const local = date.getTime() + KST_OFFSET_MS
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000)
}

/** "HH:mm" → 자정부터의 분. 형식이 틀리면 예외 (설정 검증을 통과한 값만 들어온다고 가정) */
export function parseTimeOfDay(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) throw new Error(`시각 형식이 올바르지 않습니다: ${value}`)
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * 야간 시간대인지. 시작이 종료보다 늦으면 자정을 넘는 구간(예: 22:00–06:00)이다.
 * 시작 시각은 포함, 종료 시각은 포함하지 않는다.
 */
export function isNightTime(date: Date, nightStart: string, nightEnd: string): boolean {
  const start = parseTimeOfDay(nightStart)
  const end = parseTimeOfDay(nightEnd)
  const now = minutesOfDayKst(date)
  if (start === end) return false
  return start < end ? now >= start && now < end : now >= start || now < end
}

/** 한국 시각 기준 요일. 0=월 … 6=일 */
export function weekdayKst(date: Date): number {
  return (new Date(date.getTime() + KST_OFFSET_MS).getUTCDay() + 6) % 7
}

export interface MonitoringSchedule {
  monitoringEnabled: boolean
  /** 모니터링할 요일(0=월 … 6=일). 야간 구간이 "시작되는 날" 기준이다. */
  activeWeekdays: readonly number[]
  nightStart: string
  nightEnd: string
}

/**
 * 이 시각의 움직임을 알림 판단 대상으로 볼지.
 * 모니터링이 켜져 있고, 야간 시간대이며, 그 야간 구간이 시작된 요일이 일정에 들어 있어야 한다.
 * 자정을 넘는 구간(22:00~06:00)에서 자정 이후의 시각은 전날 시작된 구간이다.
 * 예) 월요일만 켜 두면 화요일 새벽 03:00 은 월요일 밤의 일부이므로 판단하고, 월요일 새벽 03:00 은 일요일 밤이라 판단하지 않는다.
 */
export function isMonitoredTime(date: Date, schedule: MonitoringSchedule): boolean {
  if (!schedule.monitoringEnabled) return false
  if (!isNightTime(date, schedule.nightStart, schedule.nightEnd)) return false
  const start = parseTimeOfDay(schedule.nightStart)
  const end = parseTimeOfDay(schedule.nightEnd)
  const today = weekdayKst(date)
  const startedOn = start > end && minutesOfDayKst(date) < end ? (today + 6) % 7 : today
  return schedule.activeWeekdays.includes(startedOn)
}
