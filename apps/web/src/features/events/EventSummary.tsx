import { TriangleAlert, Clock, Activity } from 'lucide-react'
import type { TimelineSummaryResponse } from '@tetris/shared'
import { Card } from '@/components/ui/Card'
import { formatLocalDateTime } from '@/lib/localTime'
import { formatRelative } from '@/lib/format'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface SummaryState {
  data: TimelineSummaryResponse | undefined
  isError: boolean
  isPending: boolean
}

function Tile({
  icon: Icon,
  label,
  children,
  hint,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <Card padding="sm" className="p-3 md:p-5" as="div">
      <p className="flex items-center gap-1.5 text-caption text-ink-muted md:gap-2 md:text-body-sm">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </p>
      {/* 좁은 화면에서는 세 칸을 한 줄에 놓아 타임라인이 먼저 보이게 한다 */}
      <p className="mt-1 text-h2 text-ink md:text-numeric">{children}</p>
      {hint ? <p className="mt-1 hidden text-body-sm text-ink-muted md:block">{hint}</p> : null}
    </Card>
  )
}

/**
 * 이벤트 요약: 전체 감지 건수 · 주의 이벤트 건수 · 최근 감지 시간.
 * 지금 조건 전체에 대한 값이며, 화면에 불러온 쪽의 건수가 아니다.
 * 불러오지 못했으면 0건으로 보이지 않게 "확인하지 못했습니다"로 알린다.
 */
export function EventSummary({ summary }: { summary: SummaryState }) {
  if (summary.isError) {
    return (
      <p role="alert" className="text-body text-status-danger-strong">
        요약을 불러오지 못했습니다. 아래 기록은 그대로 확인할 수 있습니다.
      </p>
    )
  }
  const data = summary.data
  const waiting = <span className="text-ink-muted">–</span>
  return (
    <section aria-label="이벤트 요약">
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Tile icon={Activity} label="전체 감지 건수">
          {data ? (
            <>
              {data.total}
              <span className="text-body font-semibold">건</span>
            </>
          ) : (
            waiting
          )}
        </Tile>
        <Tile
          icon={TriangleAlert}
          label="주의 이벤트"
          hint="'확인 필요' 이상으로 알림과 이어진 기록"
        >
          {data ? (
            <>
              {data.attention}
              <span className="text-body font-semibold">건</span>
            </>
          ) : (
            waiting
          )}
        </Tile>
        <Tile icon={Clock} label="최근 감지 시간">
          {data ? (
            data.lastEventAt ? (
              <>
                <time dateTime={data.lastEventAt} className="text-h3 md:text-h2">
                  {formatRelative(data.lastEventAt)}
                </time>
                <span className="mt-1 block text-body-sm font-normal text-ink-muted">
                  {formatLocalDateTime(data.lastEventAt)}
                </span>
              </>
            ) : (
              <span className="text-h3 md:text-h2">기록 없음</span>
            )
          ) : (
            waiting
          )}
        </Tile>
      </div>
    </section>
  )
}
