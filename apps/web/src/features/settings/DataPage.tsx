import { useState } from 'react'
import { Link } from 'react-router'
import { QueryState } from '@/components/common/QueryState'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackupCard } from './BackupCard'
import { useDetectionSettings } from './hooks'

function Counts({
  label,
  counts,
}: {
  label: string
  counts: { sensors: number; events: number; alerts: number }
}) {
  return (
    <div>
      <h3 className="font-semibold">{label}</h3>
      <p className="text-ink-muted">
        센서 {counts.sensors}개 · 움직임 기록 {counts.events}건 · 알림 {counts.alerts}건
      </p>
    </div>
  )
}

/** 실제 데이터와 시뮬레이션 데이터의 양을 따로 보여 주고, 시뮬레이션 데이터만 지울 수 있다. */
export function DataPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const summary = useQuery({
    queryKey: queryKeys.dataSummary,
    queryFn: ({ signal }) => api.data.summary(signal),
  })
  const settings = useDetectionSettings()
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState<{
    sensors: number
    events: number
    alerts: number
  } | null>(null)
  const remove = useMutation({
    mutationFn: () => api.data.deleteSimulated(),
    onSuccess: (result) => {
      setDeleted(result.deleted)
      setConfirming(false)
    },
    onSettled: () => {
      for (const key of [
        queryKeys.dataSummary,
        queryKeys.sensors.all,
        queryKeys.alerts.all,
        queryKeys.events.all,
        queryKeys.simulator,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })

  return (
    <div className="space-y-4">
      <h1 className="text-h1">데이터 관리</h1>

      <Card title="저장된 데이터">
        <QueryState
          query={summary}
          loadingLabel="데이터 양을 불러오는 중"
          errorTitle="데이터 양을 불러오지 못했습니다"
        >
          {(data) => (
            <div className="space-y-4">
              <Counts label="실제 센서" counts={data.real} />
              <Counts label="시뮬레이션" counts={data.simulated} />
            </div>
          )}
        </QueryState>
      </Card>

      <BackupCard />

      <Card title="시뮬레이션 데이터 삭제">
        <div className="space-y-3">
          <p>
            시뮬레이터가 만든 센서·움직임 기록·알림만 지웁니다.{' '}
            <span className="font-semibold">실제 센서의 데이터는 그대로입니다.</span>
          </p>
          {confirming ? (
            <Callout tone="danger" title="시뮬레이션 데이터를 영구 삭제합니다">
              <p className="text-sm">되돌릴 수 없습니다.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? '삭제하는 중…' : '영구 삭제'}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  취소
                </Button>
              </div>
            </Callout>
          ) : (
            <Button
              variant="secondary"
              disabled={
                summary.data !== undefined &&
                summary.data.simulated.sensors +
                  summary.data.simulated.events +
                  summary.data.simulated.alerts ===
                  0
              }
              onClick={() => {
                setDeleted(null)
                setConfirming(true)
              }}
            >
              시뮬레이션 데이터 삭제
            </Button>
          )}
          {deleted ? (
            <p role="status">
              지웠습니다. (센서 {deleted.sensors}개, 움직임 기록 {deleted.events}건, 알림{' '}
              {deleted.alerts}건)
            </p>
          ) : null}
          {remove.isError ? (
            <p role="alert" className="text-status-danger">
              {remove.error.message}
            </p>
          ) : null}
        </div>
      </Card>

      <Card title="기록 보관 기간">
        {settings.data ? (
          <div>
            <p>움직임 기록은 {settings.data.retentionDays}일이 지나면 자동으로 삭제됩니다.</p>
            <Link
              to="/settings/detection"
              className="inline-flex min-h-12 items-center text-brand-strong underline"
            >
              감지 설정에서 바꾸기
            </Link>
          </div>
        ) : settings.isError ? (
          <p role="alert" className="text-status-danger">
            보관 기간을 불러오지 못했습니다.
          </p>
        ) : (
          <p className="text-ink-muted">불러오는 중…</p>
        )}
      </Card>
    </div>
  )
}
