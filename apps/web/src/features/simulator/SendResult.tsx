import { ZONE_LABELS, type SimulatorSendResult } from '@tetris/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Card } from '@/components/ui/Card'
import { formatDateTime, formatTime } from '@/lib/format'
import { ALERT_TYPE_LABELS } from '@/lib/labels'
import type { AlertType } from '@tetris/shared'

const REQUEST_STATUS: Record<
  SimulatorSendResult['requests'][number]['status'],
  { label: string; tone: 'ok' | 'muted' | 'danger' }
> = {
  ACCEPTED: { label: '저장됨', tone: 'ok' },
  DUPLICATE: { label: '중복이라 저장하지 않음', tone: 'muted' },
  REJECTED: { label: '거부됨', tone: 'danger' },
  OK: { label: '서버가 신호를 받음', tone: 'ok' },
}

function alertLabel(type: string): string {
  return ALERT_TYPE_LABELS[type as AlertType] ?? type
}

/** 전송 한 번의 결과: 수집 API 의 응답, 새로 생긴 알림. */
function ResultBody({ result }: { result: SimulatorSendResult }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={result.ok ? 'ok' : 'danger'}>
          {result.ok ? '서버가 처리했습니다' : '전송에 실패했습니다'}
        </StatusBadge>
        <span className="font-semibold">{result.label}</span>
      </div>
      <p className="text-body-sm text-ink-muted">
        {ZONE_LABELS[result.zone]}
        {result.sensorName ? ` · ${result.sensorName}` : ''} · 보낸 시각 {formatDateTime(result.at)}
        {result.occurredAt
          ? ` · 발생 시각으로 ${formatDateTime(result.occurredAt)}를 실어 보냄 (늦게 도착한 신호로 표시됨)`
          : ''}
      </p>
      {result.error ? (
        <p role="alert" className="font-semibold text-status-danger">
          {result.error}
        </p>
      ) : null}
      {result.requests.length > 0 ? (
        <ol className="list-decimal space-y-1 pl-5">
          {result.requests.map((request, index) => {
            const status = REQUEST_STATUS[request.status]
            return (
              <li key={`${request.eventId ?? 'none'}-${index}`}>
                <StatusBadge tone={status.tone} size="sm">
                  {status.label}
                </StatusBadge>
                {request.eventId ? (
                  <span className="ml-2 text-caption text-ink-muted">
                    이벤트 {request.eventId.slice(0, 8)}…
                  </span>
                ) : null}
                {request.reason ? (
                  <span className="ml-2 text-body-sm text-status-danger">({request.reason})</span>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
      {result.newAlerts.length > 0 ? (
        <div>
          <p className="font-semibold">이 전송으로 새로 만들어진 알림</p>
          <ul className="list-disc pl-5">
            {result.newAlerts.map((alert) => (
              <li key={alert.id}>
                {alertLabel(alert.type)} — {alert.title}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-body-sm text-ink-muted">
          새로 만들어진 알림은 없습니다. (야간 시간대가 아니거나, 규칙에 맞지 않거나, 이미 있는
          알림에 합쳐졌을 수 있습니다)
        </p>
      )}
    </div>
  )
}

export function LastSendCard({ recent }: { recent: readonly SimulatorSendResult[] }) {
  const last = recent[0]
  return (
    <Card title="전송 결과" description="가장 최근에 서버로 보낸 신호의 처리 결과입니다.">
      {last ? (
        <div aria-live="polite">
          <ResultBody result={last} />
        </div>
      ) : (
        <p className="text-ink-muted">아직 보낸 신호가 없습니다. 위에서 움직임을 보내 보세요.</p>
      )}
    </Card>
  )
}

export function RecentSendsCard({ recent }: { recent: readonly SimulatorSendResult[] }) {
  return (
    <Card
      title="최근 전송 이벤트 기록"
      description="이 서버가 켜져 있는 동안 시뮬레이터가 보낸 최근 30건입니다. (서버를 다시 켜면 비워집니다)"
    >
      {recent.length === 0 ? (
        <p className="text-ink-muted">기록이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((result) => (
            <li key={result.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="text-body-sm text-ink-muted">{formatTime(result.at)}</span>
              <span className="font-semibold">
                {ZONE_LABELS[result.zone]} · {result.label}
              </span>
              <StatusBadge tone={result.ok ? 'ok' : 'danger'} size="sm">
                {result.ok ? '성공' : '실패'}
              </StatusBadge>
              {result.requests.some((r) => r.status === 'DUPLICATE') ? (
                <StatusBadge tone="muted" size="sm">
                  중복 있음
                </StatusBadge>
              ) : null}
              {result.newAlerts.length > 0 ? (
                <span className="text-body-sm">알림 {result.newAlerts.length}건 생성</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
