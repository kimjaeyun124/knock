/**
 * 사용자 기기의 시간대(로컬 시간)로 시각을 보여 주고 날짜를 나누는 함수들.
 * 서버는 시각을 ISO 8601(UTC)로만 주고받으며, 화면에서만 로컬 시간으로 바꾼다.
 * (대시보드·알림은 한국 시간으로 고정해 보여 준다. 움직임 기록만 기기 시간대를 따른다.)
 */

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })
const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const dayHeadingFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

/** 기기의 시간대 이름 (예: "Asia/Seoul") */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** "오후 3:04" */
export function formatLocalTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** "11월 17일 오후 3:04" */
export function formatLocalDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** 로컬 시간 기준 날짜 (YYYY-MM-DD) */
export function localDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // 2월 30일 같은 날짜는 Date 가 다음 달로 넘기므로 되돌려 확인한다.
  const check = new Date(year, month - 1, day)
  return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day
    ? { year, month, day }
    : null
}

export function isValidDateKey(key: string): boolean {
  return parseKey(key) !== null
}

/** 로컬 날짜의 시작 시각(ISO). 날짜 형식이 올바르지 않으면 null */
export function localDayStart(key: string): string | null {
  const parts = parseKey(key)
  return parts ? new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0).toISOString() : null
}

/** 로컬 날짜의 마지막 순간(ISO) */
export function localDayEnd(key: string): string | null {
  const parts = parseKey(key)
  return parts
    ? new Date(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999).toISOString()
    : null
}

/** 날짜 키에 일수를 더한다. (여름시간 같은 날짜 변경에도 날짜 단위로 계산한다) */
export function addDaysToKey(key: string, days: number): string {
  const parts = parseKey(key)
  if (!parts) return key
  return localDateKey(new Date(parts.year, parts.month - 1, parts.day + days))
}

/** "2026년 11월 17일 화요일" */
export function formatLocalDayHeading(key: string): string {
  const parts = parseKey(key)
  return parts ? dayHeadingFormat.format(new Date(parts.year, parts.month - 1, parts.day)) : key
}

/** "11/17" 처럼 짧은 날짜 */
export function formatShortKey(key: string): string {
  const parts = parseKey(key)
  return parts ? `${parts.month}/${parts.day}` : key
}
