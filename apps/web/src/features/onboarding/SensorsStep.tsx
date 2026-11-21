import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ZONE_LABELS, type Sensor } from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/lib/format'
import { useSensors } from '@/features/sensors/hooks'
import { RegistrationWizard } from '@/features/sensors/RegistrationWizard'
import { SensorStatusBadges } from '@/features/sensors/SensorStatusBadges'

function SensorRow({ sensor }: { sensor: Sensor }) {
  const real = sensor.origin === 'REAL'
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{sensor.name}</p>
        <p className="text-body-sm text-ink-muted">
          {ZONE_LABELS[sensor.zone]} · {real ? '실제 센서' : '시뮬레이션 센서(실제 장치 아님)'}
        </p>
      </div>
      <SensorStatusBadges sensor={sensor} />
      <p className="text-body-sm text-ink-muted">
        {sensor.lastSeenAt
          ? `마지막 신호: ${formatDateTime(sensor.lastSeenAt)}`
          : '아직 첫 신호를 받지 못했습니다.'}
      </p>
    </li>
  )
}

/** STEP 3. 센서 추가·설치 위치·실제/시뮬레이션 구분·연결 확인은 센서 등록 안내를 그대로 쓴다. */
export function SensorsStep({
  onBack,
  onNext,
  saving,
  error,
}: {
  onBack: () => void
  onNext: () => void
  saving: boolean
  error: string | null
}) {
  const sensors = useSensors()
  const [adding, setAdding] = useState(false)
  const list = sensors.data?.sensors
  const waiting = list?.filter((s) => s.isActive && s.lastSeenAt === null).length ?? 0

  return (
    <Card title="센서를 연결해 주세요">
      <div className="space-y-4">
        <p>
          센서는 침대 주변, 이동 경로(복도 등), 현관에 하나씩 두면 움직임이 어디서 어디로 이어졌는지
          볼 수 있습니다. 센서가 없어도 다음으로 갈 수 있지만, 그동안은 모니터링되지 않습니다.
        </p>

        {sensors.isError ? (
          <ErrorState
            title="센서 목록을 불러오지 못했습니다"
            error={sensors.error}
            onRetry={() => void sensors.refetch()}
          />
        ) : !list ? (
          <LoadingState />
        ) : list.length === 0 ? (
          <Callout tone="warn" title="등록된 센서가 없습니다">
            <p className="text-body-sm">
              센서를 등록하기 전에는 움직임을 받을 수 없고 모니터링되지 않습니다.
            </p>
          </Callout>
        ) : (
          <div>
            <h3 className="text-h3">등록한 센서 {list.length}개</h3>
            <ul className="divide-y divide-line">
              {list.map((sensor) => (
                <SensorRow key={sensor.id} sensor={sensor} />
              ))}
            </ul>
            {waiting > 0 ? (
              <Callout tone="info" title={`센서 ${waiting}개가 아직 첫 신호를 보내지 않았습니다`}>
                <p className="text-body-sm">
                  센서를 켜고 앞에서 손을 움직인 뒤 "연결 상태 다시 확인"을 눌러 주세요. 신호가 오기
                  전에는 연결되었다고 표시하지 않습니다.
                </p>
              </Callout>
            ) : null}
            <Button
              className="mt-3"
              variant="secondary"
              leadingIcon={RefreshCw}
              loading={sensors.isFetching}
              loadingText="확인하는 중…"
              onClick={() => void sensors.refetch()}
            >
              연결 상태 다시 확인
            </Button>
          </div>
        )}

        {adding ? (
          <div className="space-y-3 rounded-card border-2 border-brand p-4">
            <h3 className="text-h3">센서 추가</h3>
            <RegistrationWizard
              onCancel={() => setAdding(false)}
              onFinished={() => {
                setAdding(false)
                void sensors.refetch()
              }}
            />
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            센서 추가
          </Button>
        )}

        {adding ? null : (
          <div className="flex flex-wrap gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onBack} disabled={saving}>
              이전
            </Button>
            <Button loading={saving} loadingText="저장하는 중…" onClick={onNext}>
              {list?.length === 0 ? '나중에 등록하고 계속' : '다음'}
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="font-semibold text-status-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
