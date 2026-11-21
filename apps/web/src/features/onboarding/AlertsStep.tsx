import type { AlertPreferencesInput } from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AlertPreferenceFields } from '@/features/settings/AlertPreferenceFields'
import { BrowserNotificationGuide } from '@/features/settings/BrowserNotificationGuide'

/** STEP 5. 받을 알림 종류와 브라우저 알림 안내. */
export function AlertsStep({
  prefs,
  onChange,
  onBack,
  onNext,
  saving,
  error,
}: {
  prefs: AlertPreferencesInput
  onChange: (next: AlertPreferencesInput) => void
  onBack: () => void
  onNext: () => void
  saving: boolean
  error: string | null
}) {
  return (
    <div className="space-y-4">
      <Card title="어떤 알림을 받을까요?">
        <div className="space-y-4">
          <p>처음에는 모두 켜 두는 것을 권합니다. 알림이 많다고 느끼면 나중에 줄일 수 있습니다.</p>
          <AlertPreferenceFields value={prefs} onChange={onChange} disabled={saving} />
        </div>
      </Card>
      <Card title="브라우저 알림">
        <BrowserNotificationGuide />
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          이전
        </Button>
        <Button loading={saving} loadingText="저장하는 중…" onClick={onNext}>
          다음
        </Button>
      </div>
      {error ? (
        <p role="alert" className="font-semibold text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
