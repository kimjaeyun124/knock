import type { BackupStatus } from '@tetris/shared'
import { QueryState } from '@/components/common/QueryState'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { formatRelative } from '@/lib/format'
import { useBackupStatus } from './hooks'

/** 백업이 간격의 몇 배 넘게 없으면 "오래됨"으로 본다. (점검 간격과 실패 후 재시도를 감안한 여유) */
const STALE_FACTOR = 2

function Details({ status, now }: { status: BackupStatus; now: Date }) {
  return (
    <>
      {status.lastSuccessAt ? (
        <p>마지막 성공: {formatRelative(status.lastSuccessAt, now)}</p>
      ) : null}
      <p className="text-ink-muted">
        약 {status.intervalHours}시간마다 만들고, 최근 {status.keep}개까지 보관합니다. (지금{' '}
        {status.backupCount}개)
      </p>
    </>
  )
}

function Body({ status }: { status: BackupStatus }) {
  const now = new Date()
  if (!status.enabled) {
    return (
      <Callout tone="warn" title="이 서버는 자동 백업을 하지 않습니다">
        <p>
          기기가 고장 나거나 파일이 지워지면 기록을 되찾지 못할 수 있습니다. 다른 방법으로 이미
          백업하고 있지 않다면 서버 설정에서 자동 백업을 켜 주세요.
        </p>
      </Callout>
    )
  }
  if (status.lastRunFailed) {
    return (
      <Callout tone="danger" title="가장 최근 백업에 실패했습니다">
        <p>서버 기록에서 이유를 확인해 주세요. 이전에 만든 백업은 그대로 있습니다.</p>
        <Details status={status} now={now} />
      </Callout>
    )
  }
  if (!status.lastSuccessAt) {
    return (
      <Callout tone="warn" title="아직 만들어진 백업이 없습니다">
        <p>곧 만들어집니다. 오래 이 상태이면 서버 기록을 확인해 주세요.</p>
      </Callout>
    )
  }
  const staleMs = (status.intervalHours ?? 24) * STALE_FACTOR * 3_600_000
  if (now.getTime() - new Date(status.lastSuccessAt).getTime() > staleMs) {
    return (
      <Callout tone="warn" title="백업이 오래되었습니다">
        <p>정해진 간격보다 오래 새 백업이 만들어지지 않았습니다. 서버 기록을 확인해 주세요.</p>
        <Details status={status} now={now} />
      </Callout>
    )
  }
  return (
    <Callout tone="ok" title="자동 백업이 켜져 있습니다">
      <Details status={status} now={now} />
    </Callout>
  )
}

/** 서버의 자동 데이터베이스 백업 상태. 백업이 없거나 실패했거나 오래된 것을 숨기지 않고 알린다. */
export function BackupCard() {
  const query = useBackupStatus()
  return (
    <Card title="자동 백업">
      <div className="space-y-3">
        <QueryState
          query={query}
          loadingLabel="백업 상태를 불러오는 중"
          errorTitle="백업 상태를 불러오지 못했습니다"
        >
          {(status) => <Body status={status} />}
        </QueryState>
        <p className="text-sm text-ink-muted">
          백업 파일이 만들어졌다는 뜻이며, 다른 기기로 옮겨 두었다는 뜻은 아닙니다. 복구가 되는지는
          운영 안내에 따라 직접 한 번 해 보세요.
        </p>
      </div>
    </Card>
  )
}
