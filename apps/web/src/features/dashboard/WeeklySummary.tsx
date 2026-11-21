import { TriangleAlert } from 'lucide-react'
import type { DailySummaryDay } from '@tetris/shared'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatShortDate } from '@/lib/format'
import { isWeeklyEmpty } from './weekly'

const BAR_AREA_PX = 96

/**
 * 최근 7일 움직임 요약. 날짜별 감지 건수(막대)와 주의 이벤트 건수(아래 표시)를 보여 준다.
 * 두 값은 크기가 달라 한 축에 겹치지 않고 따로 놓았다. 막대는 눈으로 보는 용도이고,
 * 같은 숫자를 막대 위·아래 글자와 표로도 제공한다. 주의 이벤트는 색뿐 아니라 아이콘과 글자로도 구분한다.
 */
export function WeeklySummary({
  days,
  today,
  stale = false,
}: {
  days: readonly DailySummaryDay[]
  /** 오늘 날짜 (YYYY-MM-DD, 한국 시간). 막대에 "오늘"을 표시한다. */
  today: string
  stale?: boolean
}) {
  const max = Math.max(1, ...days.map((day) => day.movements))
  const total = days.reduce((sum, day) => sum + day.movements, 0)
  const attentionTotal = days.reduce((sum, day) => sum + day.attentionAlerts, 0)
  const hasSimulated = days.some((day) => day.simulatedMovements > 0)

  return (
    <Card
      title="최근 7일 움직임"
      description={stale ? '연결이 끊기기 전에 받은 기록입니다.' : undefined}
    >
      {isWeeklyEmpty(days) ? (
        <EmptyState
          title="최근 7일 동안 기록된 움직임이 없습니다"
          description="센서가 움직임 신호를 보내면 날짜별 건수가 여기에 표시됩니다."
        />
      ) : (
        <>
          <ul
            aria-hidden="true"
            className="grid grid-cols-7 gap-2"
            style={{ gridAutoRows: 'min-content' }}
          >
            {days.map((day) => {
              const height =
                day.movements === 0 ? 4 : Math.max(8, (day.movements / max) * BAR_AREA_PX)
              return (
                <li key={day.date} className="flex flex-col items-center gap-1">
                  <span className="text-body-sm font-semibold text-ink">{day.movements}</span>
                  <span
                    className="flex items-end"
                    style={{ height: BAR_AREA_PX }}
                    title={`${formatShortDate(day.date)} 감지 ${day.movements}건`}
                  >
                    <span
                      className={`block w-6 rounded-t-control ${day.movements === 0 ? 'bg-line' : 'bg-brand'}`}
                      style={{ height }}
                    />
                  </span>
                  <span
                    className={`text-caption ${day.date === today ? 'font-bold text-ink' : 'text-ink-muted'}`}
                  >
                    {day.date === today ? '오늘' : formatShortDate(day.date).split(' ')[0]}
                  </span>
                  <span
                    className={`inline-flex min-h-6 items-center gap-0.5 text-caption font-semibold ${day.attentionAlerts > 0 ? 'text-status-warn-strong' : 'text-ink-muted'}`}
                  >
                    {day.attentionAlerts > 0 ? (
                      <>
                        <TriangleAlert aria-hidden="true" className="size-3.5" />
                        {day.attentionAlerts}
                      </>
                    ) : (
                      '–'
                    )}
                  </span>
                </li>
              )
            })}
          </ul>

          {/* 범례: 색(막대)·모양(삼각형)과 이름을 함께 */}
          <p
            aria-hidden="true"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="block h-3 w-3 rounded-sm bg-brand" />
              감지 건수
            </span>
            <span className="inline-flex items-center gap-1.5 text-status-warn-strong">
              <TriangleAlert className="size-4" />
              주의 이벤트
            </span>
          </p>
          <p className="mt-2 text-body-sm text-ink-muted">
            7일 동안 움직임 신호 {total}건, 주의 이벤트 {attentionTotal}건 · 한국 시간 기준
            {hasSimulated ? ' · 시뮬레이션 신호가 포함되어 있습니다' : ''}
          </p>

          <table className="sr-only">
            <caption>최근 7일 날짜별 움직임 신호 수와 주의 이벤트 수</caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">감지 건수</th>
                <th scope="col">주의 이벤트</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{formatShortDate(day.date)}</th>
                  <td>{day.movements}건</td>
                  <td>{day.attentionAlerts}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  )
}
