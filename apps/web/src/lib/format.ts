const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** 서버는 UTC로 저장하고, 화면에는 항상 한국 시간으로 보여 준다. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** "방금 전", "5분 전", "3시간 전", 그보다 오래되면 날짜와 시각 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  if (diffMs < 0) return formatDateTime(iso)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return formatDateTime(iso)
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 한국 시간 기준의 날짜(YYYY-MM-DD) */
export function kstDateString(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 한국 시간 기준 하루의 시작·끝(UTC ISO). date 는 YYYY-MM-DD */
export function kstDayRange(date: string): { from: string; to: string } {
  const startMs = Date.parse(`${date}T00:00:00.000Z`) - KST_OFFSET_MS
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(startMs + 24 * 60 * 60 * 1000 - 1).toISOString(),
  }
}

/** 한국 시간 기준 시(0–23) */
export function kstHour(iso: string): number {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).getUTCHours()
}

const longDateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

/** "2026년 11월 17일 화요일" (한국 시간) */
export function formatLongDate(date: Date): string {
  return longDateFormat.format(date)
}

/** "오후 3:04" (한국 시간) */
export function formatClock(date: Date): string {
  return timeFormat.format(date)
}

/** "11/14 (토)" 처럼 그래프 눈금에 쓰는 짧은 날짜. date 는 YYYY-MM-DD 이다. */
export function formatShortDate(date: string): string {
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'short' }).format(
    new Date(`${date}T00:00:00.000Z`),
  )
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} (${weekday})`
}

/** "22:00" → "오후 10:00" */
export function formatTimeOfDay(hhmm: string): string {
  const [hour = 0, minute = 0] = hhmm.split(':').map(Number)
  return timeFormat.format(new Date(Date.UTC(2026, 0, 1, hour - 9, minute)))
}
