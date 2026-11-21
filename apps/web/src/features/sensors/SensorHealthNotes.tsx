import { AlarmClockOff, TriangleAlert } from 'lucide-react'
import type { Sensor } from '@tetris/shared'
import { useNow } from '@/hooks/useNow'
import { formatRelative } from '@/lib/format'
import { describeReceiveErrorReason, formatSilence, hasRecentReceiveError } from './sensorHealth'

/**
 * 연결·배터리 배지로는 보이지 않는 센서 문제를 글로 알린다.
 *  - 장시간 미응답: 끊긴 채 오래 신호가 없음 → 직접 확인이 필요하다
 *  - 데이터 수신 오류: 센서는 신호를 보냈지만 서버가 받지 못한 데이터가 있음
 * 문제가 없으면 아무것도 그리지 않는다.
 */
export function SensorHealthNotes({ sensor }: { sensor: Sensor }) {
  const now = useNow()
  const { receiveErrors } = sensor
  const recentError = hasRecentReceiveError(sensor, now)
  const showLongSilent = sensor.isActive && sensor.longSilent && sensor.silentSeconds !== null
  if (!showLongSilent && receiveErrors.count === 0) return null

  return (
    <div className="space-y-1">
      {showLongSilent ? (
        <p className="flex items-start gap-2 text-body-sm font-semibold text-status-danger-strong">
          <AlarmClockOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          장시간 미응답: 신호가 {formatSilence(sensor.silentSeconds ?? 0)} 넘게 없습니다. 센서의
          전원·배터리·설치 상태를 직접 확인해 주세요.
        </p>
      ) : null}
      {receiveErrors.count > 0 ? (
        <p
          className={`flex items-start gap-2 text-body-sm ${recentError ? 'font-semibold text-status-warn-strong' : 'text-ink-muted'}`}
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            데이터 수신 오류 {receiveErrors.count}건
            {receiveErrors.lastAt
              ? ` · 마지막 ${formatRelative(receiveErrors.lastAt)}: ${describeReceiveErrorReason(receiveErrors.lastReason)}`
              : ''}
            {recentError ? ' (최근 1시간 안)' : ''}
          </span>
        </p>
      ) : null}
    </div>
  )
}
