import { RECENT_RECEIVE_ERROR_SECONDS, type Sensor } from '@tetris/shared'

/** 서버가 데이터를 받지 못한 이유(수집 계약의 거부 이유 + 형식 오류)를 사람이 읽는 말로 */
const RECEIVE_ERROR_REASONS: Record<string, string> = {
  TOO_OLD: '발생 시각이 너무 오래된 신호',
  FUTURE_TIMESTAMP: '발생 시각이 미래인 신호 (센서 시계가 틀렸을 수 있음)',
  TYPE_MISMATCH: '이 센서가 보낼 수 없는 종류의 신호',
  INVALID_PAYLOAD: '형식이 올바르지 않은 요청',
}

export function describeReceiveErrorReason(reason: string | null): string {
  if (!reason) return '이유를 알 수 없음'
  return RECEIVE_ERROR_REASONS[reason] ?? '받을 수 없는 데이터'
}

/** 신호가 없었던 시간을 "5분", "2시간 5분" 으로 */
export function formatSilence(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return '1분 미만'
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
  const days = Math.floor(hours / 24)
  return `${days}일 ${hours % 24}시간`
}

/** 최근(1시간 안)에 받지 못한 데이터가 있었는가. 오래전 오류는 기록으로만 남기고 주의로 보이지 않는다. */
export function hasRecentReceiveError(
  sensor: Pick<Sensor, 'receiveErrors' | 'isActive'>,
  now: Date,
): boolean {
  const { lastAt } = sensor.receiveErrors
  if (!sensor.isActive || !lastAt) return false
  return now.getTime() - Date.parse(lastAt) <= RECENT_RECEIVE_ERROR_SECONDS * 1000
}
