import { ADAPTER_STATE_LABELS, CHANNEL_LABELS } from '@tetris/shared'
import { Link } from 'react-router'
import { QueryState } from '@/components/common/QueryState'
import { IntegrationModeBadge, SampleBadge } from '@/components/status/DomainBadges'
import { Card } from '@/components/ui/Card'
import { useIsMocked } from '@/hooks/useApi'
import { formatDateTime } from '@/lib/format'
import { CHANNEL_NOTES } from './channelNotes'
import { useIntegrations, useSensorAdapters } from './hooks'

/**
 * 알림 채널이 실제로 연동되어 있는지, 가짜 응답인지, 연동되지 않았는지 구분해서 보여 준다.
 * 서버가 각 채널의 상태를 직접 밝힌 것을 그대로 보여 주며, 화면이 추측하지 않는다.
 */
export function IntegrationsPage() {
  const query = useIntegrations()
  const mocked = useIsMocked('integrations')
  const adapters = useSensorAdapters()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1">연동 현황</h1>
        {mocked ? <SampleBadge /> : null}
      </div>
      {mocked ? (
        <p className="text-ink-muted">개발용 샘플입니다. 아래 내용은 실제 연동 상태가 아닙니다.</p>
      ) : null}
      <Card>
        <QueryState query={query} loadingLabel="연동 현황을 불러오는 중">
          {(data) => (
            <ul className="divide-y divide-line">
              {data.integrations.map((item) => (
                <li key={item.key} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{CHANNEL_LABELS[item.key]}</p>
                    <IntegrationModeBadge mode={item.mode} />
                  </div>
                  <p className="text-sm text-ink-muted">{CHANNEL_NOTES[item.key]}</p>
                  <p className="text-sm text-ink-muted">
                    {item.lastSuccessAt
                      ? `마지막 전달 성공: ${formatDateTime(item.lastSuccessAt)}`
                      : '전달에 성공한 기록이 없습니다.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
      <Card title="센서 연결 방식">
        <p className="mb-2 text-sm text-ink-muted">
          센서의 신호를 서버로 들여오는 통로입니다. 실제 센서와 연결된 통로가 없으면 없다고 그대로
          표시합니다. (센서마다의 연결 상태는 센서 관리에서 봅니다)
        </p>
        <QueryState query={adapters} loadingLabel="센서 연결 방식을 불러오는 중">
          {(data) => (
            <ul className="divide-y divide-line">
              {data.adapters.map((adapter) => (
                <li key={adapter.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {adapter.label}{' '}
                      <span className="font-normal text-ink-muted">
                        ({adapter.origin === 'SIMULATED' ? '시뮬레이션' : '실제 센서용'})
                      </span>
                    </p>
                    <span className="text-sm font-semibold">
                      {ADAPTER_STATE_LABELS[adapter.state]}
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {adapter.realHardwareConnected
                      ? '실제 하드웨어와 연결되어 있습니다.'
                      : '실제 하드웨어와 연결되어 있지 않습니다.'}
                    {adapter.errorCount > 0
                      ? ` 처리하지 못한 신호 ${adapter.errorCount}건${adapter.lastError ? ` (${adapter.lastError})` : ''}.`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </Card>
      <p>
        <Link
          to="/settings/notifications"
          className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
        >
          알림 채널 설정과 테스트 보내기
        </Link>
      </p>
    </div>
  )
}
