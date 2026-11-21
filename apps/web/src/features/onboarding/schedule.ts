import { DEFAULT_DETECTION_SETTINGS } from '@tetris/shared'

/** 처음 제안하는 야간 시간. 서버 기본값과 같다. */
export const SUGGESTED_NIGHT = {
  start: DEFAULT_DETECTION_SETTINGS.nightStart,
  end: DEFAULT_DETECTION_SETTINGS.nightEnd,
} as const

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export interface ScheduleErrors {
  nightStart?: string
  nightEnd?: string
}

/** 모니터링 시간 입력 검사. 오류가 없으면 빈 객체 */
export function validateSchedule(start: string, end: string): ScheduleErrors {
  const errors: ScheduleErrors = {}
  if (!start) errors.nightStart = '시작 시각을 입력해 주세요.'
  else if (!TIME.test(start)) errors.nightStart = '시작 시각을 시:분 형식으로 입력해 주세요.'
  if (!end) errors.nightEnd = '종료 시각을 입력해 주세요.'
  else if (!TIME.test(end)) errors.nightEnd = '종료 시각을 시:분 형식으로 입력해 주세요.'
  if (!errors.nightStart && !errors.nightEnd && start === end) {
    errors.nightEnd = '시작과 종료 시각은 달라야 합니다.'
  }
  return errors
}

function minutes(value: string): number {
  const [h = '0', m = '0'] = value.split(':')
  return Number(h) * 60 + Number(m)
}

/** 모니터링하는 시간의 길이(분). 종료가 시작보다 이르면 자정을 넘는 구간으로 본다. */
export function durationMinutes(start: string, end: string): number {
  const diff = minutes(end) - minutes(start)
  return diff > 0 ? diff : diff + 24 * 60
}

export function crossesMidnight(start: string, end: string): boolean {
  return minutes(end) < minutes(start)
}

export function describeDuration(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (m === 0) return `${h}시간`
  return h === 0 ? `${m}분` : `${h}시간 ${m}분`
}
