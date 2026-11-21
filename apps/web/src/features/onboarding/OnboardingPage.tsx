import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PAGE_TITLES, PATHS } from '@/app/paths'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSensors } from '@/features/sensors/hooks'
import { useAlertPreferences, useDetectionSettings } from '@/features/settings/hooks'
import { formatDateTime } from '@/lib/format'
import { useHousehold } from './hooks'
import { OnboardingWizard } from './OnboardingWizard'
import { parseStep } from './steps'
import { ONBOARDING_STEP_COUNT } from '@tetris/shared'

/** 이미 초기 설정을 마친 사용자에게는 설정을 처음부터 다시 시키지 않고, 바꿀 곳으로 안내한다. */
function AlreadyDone({
  completedAt,
  onReview,
}: {
  completedAt: string | null
  onReview: () => void
}) {
  return (
    <div className="space-y-4">
      <Callout tone="ok" title="초기 설정을 이미 마쳤습니다">
        <p className="text-body-sm">
          {completedAt ? `${formatDateTime(completedAt)}에 마쳤습니다. ` : ''}
          다시 설정하지 않아도 됩니다. 바꾸고 싶은 항목은 아래에서 바로 고칠 수 있습니다.
        </p>
      </Callout>
      <Card title="바꾸고 싶다면">
        <div className="flex flex-wrap gap-3">
          <Link to={PATHS.sensors} className={buttonStyles({ variant: 'secondary' })}>
            센서 관리
          </Link>
          <Link to={PATHS.settingsDetection} className={buttonStyles({ variant: 'secondary' })}>
            감지 시간·민감도
          </Link>
          <Link to={PATHS.settingsNotifications} className={buttonStyles({ variant: 'secondary' })}>
            알림 채널·받을 알림
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
          <Link to={PATHS.dashboard} className={buttonStyles()}>
            대시보드로 가기
          </Link>
          <Button variant="ghost" onClick={onReview}>
            초기 설정 단계를 다시 살펴보기
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function OnboardingPage() {
  const household = useHousehold()
  const detection = useDetectionSettings()
  const alertPrefs = useAlertPreferences()
  const sensors = useSensors()
  const [params] = useSearchParams()
  const [reviewing, setReviewing] = useState(false)

  const failed = [household, detection, alertPrefs, sensors].find((q) => q.isError)
  const ready = household.data && detection.data && alertPrefs.data && sensors.data

  return (
    <div className="space-y-4">
      <PageHeader
        title={PAGE_TITLES.onboarding}
        description="처음 쓰는 보호자를 위한 설정입니다. 단계마다 저장되어, 중간에 멈춰도 이어서 할 수 있습니다."
      />
      {failed ? (
        <ErrorState
          title="초기 설정 정보를 불러오지 못했습니다"
          error={failed.error}
          onRetry={() => {
            for (const q of [household, detection, alertPrefs, sensors]) {
              if (q.isError) void q.refetch()
            }
          }}
        />
      ) : !ready ? (
        <LoadingState />
      ) : household.data.household.setupCompleted &&
        !reviewing &&
        parseStep(params.get('step')) === null ? (
        <AlreadyDone
          completedAt={household.data.household.setupCompletedAt}
          onReview={() => setReviewing(true)}
        />
      ) : (
        <OnboardingWizard
          household={household.data.household}
          detection={detection.data}
          alertPrefs={alertPrefs.data}
          sensors={sensors.data.sensors}
          {...(household.data.household.setupCompleted
            ? { reachedOverride: ONBOARDING_STEP_COUNT }
            : {})}
        />
      )}
    </div>
  )
}
