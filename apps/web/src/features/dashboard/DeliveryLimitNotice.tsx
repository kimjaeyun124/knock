import { Link } from 'react-router'
import { Callout } from '@/components/ui/Callout'
import { useIntegrations } from '@/features/settings/hooks'

/**
 * 앱 화면 밖으로 알림을 보낼 수 있는 채널(푸시 등)이 하나도 연동되어 있지 않으면 그 사실을 홈에 항상 알린다.
 * 이 경우 화면을 닫아 두면 보호자는 알림을 전혀 받을 수 없다.
 * 연동 현황을 확인하지 못했을 때는 추측하지 않고 알림을 띄우지 않는다. (연동 현황 화면이 오류를 보여 준다)
 */
export function DeliveryLimitNotice() {
  const { data } = useIntegrations()
  if (!data) return null
  const reachesOutsideApp = data.integrations.some(
    (item) => item.key !== 'IN_APP' && item.mode !== 'NOT_CONFIGURED',
  )
  if (reachesOutsideApp) return null
  return (
    <Callout tone="warn" title="이 화면을 닫아 두면 알림을 받을 수 없습니다">
      <p className="text-sm">
        앱 화면 밖으로 알림을 보내는 방법(푸시·문자·카카오)이 연동되어 있지 않습니다. 알림은 이
        화면이 열려 있을 때만 전달됩니다.
      </p>
      <Link
        to="/settings/notifications"
        className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
      >
        알림 채널 설정 보기
      </Link>
    </Callout>
  )
}
