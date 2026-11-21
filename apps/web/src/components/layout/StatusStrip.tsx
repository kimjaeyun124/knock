import { FlaskConical, MailWarning, Radio, Unplug, WifiOff } from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useConnection } from '@/hooks/connectionContext'
import { useMockFeatures } from '@/hooks/useApi'
import { useSystemSummary, type SystemSummary } from '@/hooks/useSystemSummary'
import { cn } from '@/lib/cn'
import { SAMPLE_DATA_NOTICE } from '@/lib/labels'
import { ConnectionStatus } from './ConnectionStatus'

function SensorBadges({ sensors }: { sensors: SystemSummary['sensors'] }) {
  if (sensors.state === 'loading') return null
  if (sensors.state === 'error') {
    return (
      <StatusBadge tone="warn" icon={Unplug}>
        센서 상태를 확인하지 못했습니다
      </StatusBadge>
    )
  }
  const { active, offline, pending, simulated } = sensors.value
  return (
    <>
      {active === 0 ? <StatusBadge tone="muted">사용 중인 센서 없음</StatusBadge> : null}
      {active > 0 && offline === 0 && pending === 0 ? (
        <StatusBadge tone="ok" icon={Radio}>
          센서 {active}개 모두 연결됨
        </StatusBadge>
      ) : null}
      {offline > 0 ? (
        <StatusBadge tone="danger" icon={WifiOff}>
          연결 끊긴 센서 {offline}개
        </StatusBadge>
      ) : null}
      {pending > 0 ? <StatusBadge tone="muted">첫 신호 대기 센서 {pending}개</StatusBadge> : null}
      {simulated > 0 ? (
        <StatusBadge tone="warn" icon={FlaskConical}>
          시뮬레이션 센서 {simulated}개 사용 중
        </StatusBadge>
      ) : null}
    </>
  )
}

function DeliveryBadge({ failures }: { failures: SystemSummary['deliveryFailures'] }) {
  if (failures.state === 'loading') return null
  if (failures.state === 'error') {
    return (
      <StatusBadge tone="warn" icon={MailWarning}>
        알림 상태를 확인하지 못했습니다
      </StatusBadge>
    )
  }
  return failures.value > 0 ? (
    <StatusBadge tone="danger" icon={MailWarning}>
      알림 전달 실패 {failures.value}건
    </StatusBadge>
  ) : null
}

/**
 * 시스템 상태 영역. 헤더 안에서 항상 보인다.
 * 연결 상태(정상·연결 중·끊김·확인 불가)와 센서·알림 전달에 문제가 있으면 숨기지 않고 바로 알린다.
 * Mock(샘플 데이터)이나 시뮬레이션이 쓰이고 있으면 그 사실도 함께 알린다.
 */
export function StatusStrip({ className }: { className?: string }) {
  const summary = useSystemSummary()
  const mockFeatures = useMockFeatures()
  // 연결이 정상이 아니면 마지막으로 받은 센서·알림 정보를 "지금" 것처럼 보여 주지 않는다.
  const { state } = useConnection()
  const stale = state === 'disconnected' || state === 'unknown'

  return (
    <section
      aria-label="시스템 상태"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <ConnectionStatus />
      {stale ? (
        <StatusBadge tone="muted" icon={Unplug}>
          센서·알림 상태는 최신이 아니어서 숨겼습니다
        </StatusBadge>
      ) : (
        <>
          <SensorBadges sensors={summary.sensors} />
          <DeliveryBadge failures={summary.deliveryFailures} />
        </>
      )}
      {mockFeatures.length > 0 ? (
        <StatusBadge tone="warn" icon={FlaskConical}>
          {SAMPLE_DATA_NOTICE}
        </StatusBadge>
      ) : null}
    </section>
  )
}
