import { BellRing, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import type { AlertUnreadCountResponse } from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AlertDialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { useMarkAllAlertsRead } from './hooks'

interface UnreadSummaryProps {
  count: AlertUnreadCountResponse | undefined
  failed: boolean
  onRetry: () => void
}

/**
 * 읽지 않은 알림 수와 "모두 읽음" 버튼.
 * 읽음 표시는 알림을 봤다는 기록일 뿐이라, 읽지 않은 수가 0이어도 진행 중인 알림이 남아 있을 수 있음을 함께 알린다.
 * 수를 확인하지 못했다면 0으로 보이지 않고 확인하지 못했다고 알린다.
 */
export function UnreadSummary({ count, failed, onRetry }: UnreadSummaryProps) {
  const [confirming, setConfirming] = useState(false)
  const markAll = useMarkAllAlertsRead()
  const { toast } = useToast()

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BellRing aria-hidden="true" className="size-8 shrink-0 text-brand-strong" />
          <div aria-live="polite">
            {failed ? (
              <>
                <p className="text-h3">읽지 않은 알림 수를 확인하지 못했습니다</p>
                <Button variant="ghost" size="sm" onClick={onRetry}>
                  다시 확인
                </Button>
              </>
            ) : (
              <>
                <p className="text-body-sm text-ink-muted">읽지 않은 알림</p>
                <p className="text-numeric">
                  {count ? count.unread : <span className="text-ink-muted">–</span>}
                  <span className="text-body font-semibold">건</span>
                  {count && count.unreadImportant > 0 ? (
                    <span className="ml-3 text-body font-semibold text-status-danger-strong">
                      중요 {count.unreadImportant}건
                    </span>
                  ) : null}
                </p>
              </>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          leadingIcon={CheckCheck}
          disabled={!count || count.unread === 0 || markAll.isPending}
          onClick={() => setConfirming(true)}
        >
          모두 읽음으로 표시
        </Button>
      </div>
      <p className="mt-3 text-body-sm text-ink-muted">
        읽음 표시는 알림을 봤다는 기록일 뿐입니다. 읽었다고 해서 상황이 해결된 것은 아니며, 진행
        중인 알림은 각 알림에서 직접 확인·종료해야 합니다.
      </p>
      {markAll.isError ? (
        <p role="alert" className="mt-2 text-body-sm text-status-danger-strong">
          모두 읽음으로 표시하지 못해 이전 상태로 되돌렸습니다. {markAll.error.message}
        </p>
      ) : null}

      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="모든 알림을 읽음으로 표시할까요?"
        description="읽음으로 표시해도 알림은 지워지지 않고 처리 상태도 그대로입니다. 진행 중인 알림은 계속 진행 중으로 남습니다."
        confirmLabel="모두 읽음으로 표시"
        loading={markAll.isPending}
        onConfirm={() =>
          markAll.mutate(undefined, {
            onSuccess: ({ updated }) => {
              toast({
                tone: 'ok',
                title:
                  updated > 0
                    ? `${updated}건을 읽음으로 표시했습니다`
                    : '읽지 않은 알림이 없습니다',
              })
            },
            onSettled: () => setConfirming(false),
          })
        }
      />
    </Card>
  )
}
