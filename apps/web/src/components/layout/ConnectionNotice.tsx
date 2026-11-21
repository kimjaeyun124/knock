import { Callout } from '@/components/ui/Callout'
import { useConnection } from '@/hooks/connectionContext'
import { useSocketInfo } from '@/hooks/useSocketStatus'
import { formatTime } from '@/lib/format'

/**
 * 연결이 정상이 아닐 때 모든 화면 맨 위에 붙는 안내.
 * 끊기기 전에 받아 둔 정보가 "지금 상태"처럼 보이지 않도록, 화면의 내용이 언제 기준인지 알린다.
 * (처음 연결하는 동안에는 보여 줄 이전 정보가 없으므로 띄우지 않는다)
 */
export function ConnectionNotice() {
  const { state, detail, lastOkAt } = useConnection()
  const socket = useSocketInfo()
  if (state === 'ok' || (state === 'connecting' && lastOkAt === null)) return null

  const asOf = lastOkAt
    ? `화면의 내용은 ${formatTime(lastOkAt.toISOString())}까지 확인한 정보이며, 지금 상태와 다를 수 있습니다.`
    : '아직 최신 정보를 받지 못했습니다. 화면의 내용을 지금 상태로 믿지 마세요.'

  return (
    <section aria-label="연결 안내" className="bg-canvas px-4 py-3 md:px-8">
      {state === 'connecting' ? (
        <Callout tone="info" title="다시 연결하는 중입니다">
          <p>{asOf}</p>
        </Callout>
      ) : (
        <Callout
          tone={state === 'disconnected' ? 'danger' : 'warn'}
          title={
            state === 'disconnected'
              ? '연결이 끊겨 최신 정보를 받지 못하고 있습니다'
              : '서버 상태를 확인하지 못했습니다'
          }
        >
          <p>{asOf}</p>
          {socket.reconnectAttempts > 0 ? (
            <p className="mt-1 text-body-sm" role="status">
              실시간 연결을 {socket.reconnectAttempts}번째 다시 시도하고 있습니다.
              {socket.lastError ? ` (마지막 오류: ${socket.lastError})` : ''}
            </p>
          ) : null}
          <p className="mt-1 text-body-sm">
            {detail} 연결이 돌아오면 자동으로 다시 확인합니다. 걱정되시면 어르신께 직접 연락하거나
            확인해 주세요.
          </p>
        </Callout>
      )}
    </section>
  )
}
