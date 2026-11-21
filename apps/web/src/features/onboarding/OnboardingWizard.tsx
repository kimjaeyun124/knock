import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  ONBOARDING_STEP_COUNT,
  type AlertPreferences,
  type AlertPreferencesInput,
  type DetectionSettings,
  type HouseholdResponse,
  type HouseholdUpdate,
  type Sensor,
} from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { Callout } from '@/components/ui/Callout'
import { useToast } from '@/components/ui/Toast'
import { useUpdateAlertPreferences } from '@/features/settings/hooks'
import { queryKeys } from '@/lib/queryKeys'
import { AlertsStep } from './AlertsStep'
import { IntroStep } from './IntroStep'
import { RecipientStep } from './RecipientStep'
import { ReviewStep } from './ReviewStep'
import { ScheduleStep } from './ScheduleStep'
import { SensorsStep } from './SensorsStep'
import { StepIndicator } from './StepIndicator'
import { useSaveSchedule, useUpdateHousehold } from './hooks'
import { ONBOARDING_STEPS, parseStep, resolveStep } from './steps'

interface Draft {
  alias: string
  memo: string
  nightStart: string
  nightEnd: string
  prefs: AlertPreferencesInput
}

function toPrefsInput(prefs: AlertPreferences): AlertPreferencesInput {
  return {
    bedAreaActivity: prefs.bedAreaActivity,
    bedToPath: prefs.bedToPath,
    entranceApproach: prefs.entranceApproach,
    repeatedMovement: prefs.repeatedMovement,
    sensorIssues: prefs.sensorIssues,
    lowBattery: prefs.lowBattery,
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}

/**
 * 초기 설정 마법사(6단계).
 *
 * - 단계는 주소(?step=)에 담겨 새로고침·뒤로 가기에도 유지된다. 아직 도달하지 않은 단계로는 건너뛸 수 없다.
 * - 단계마다 "다음"을 누를 때 서버에 저장하고, 도달한 단계도 서버에 남긴다. 도중에 나가도 거기서 이어 한다.
 * - 입력 중인 값(draft)은 이 화면이 열려 있는 동안 단계를 오가도 유지된다.
 */
export function OnboardingWizard({
  household,
  detection,
  alertPrefs,
  sensors,
  reachedOverride,
}: {
  household: HouseholdResponse['household']
  detection: DetectionSettings
  alertPrefs: AlertPreferences
  sensors: readonly Sensor[]
  /** 이미 설정을 마친 사용자가 다시 살펴볼 때는 모든 단계를 열어 둔다. */
  reachedOverride?: number
}) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const updateHousehold = useUpdateHousehold()
  const saveSchedule = useSaveSchedule()
  const updatePrefs = useUpdateAlertPreferences()

  const reached = reachedOverride ?? household.onboardingStep
  const requested = parseStep(params.get('step'))
  const step = resolveStep(requested, reached)
  // 이전에 하던 곳에서 이어 하는 경우(주소에 단계가 없고 이미 진행한 기록이 있음)에만 안내한다.
  const [resumedFrom] = useState(() => (requested === null && reached > 1 ? reached : null))

  const [draft, setDraft] = useState<Draft>(() => ({
    alias: household.recipientAlias ?? '',
    memo: household.recipientMemo ?? '',
    nightStart: detection.nightStart,
    nightEnd: detection.nightEnd,
    prefs: toPrefsInput(alertPrefs),
  }))
  const [error, setError] = useState<{ step: number; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const stepError = error?.step === step ? error.message : null

  const goTo = (next: number) => {
    setError(null)
    setParams({ step: String(Math.min(Math.max(next, 1), ONBOARDING_STEP_COUNT)) })
  }

  /** 저장을 실행하고, 성공하면 다음 단계로 간다. 실패하면 그 자리에 머물며 이유를 알린다. */
  const saveAndGo = async (
    action: () => Promise<unknown>,
    to: number,
    /** false 면 action 이 이미 도달 단계까지 함께 저장한다. */
    recordStep = true,
  ) => {
    setSaving(true)
    setError(null)
    try {
      await action()
      if (recordStep) await updateHousehold.mutateAsync({ onboardingStep: to })
      goTo(to)
    } catch (cause) {
      setError({ step, message: messageOf(cause) })
    } finally {
      setSaving(false)
    }
  }

  const complete = async () => {
    setSaving(true)
    setError(null)
    try {
      const update: HouseholdUpdate = { completeSetup: true }
      await updateHousehold.mutateAsync(update)
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast({ tone: 'ok', title: '초기 설정을 마쳤습니다' })
      void navigate(PATHS.dashboard)
    } catch (cause) {
      setError({ step, message: messageOf(cause) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <StepIndicator current={step} />
      {resumedFrom !== null && step === resumedFrom ? (
        <Callout tone="info" title="이전에 하던 곳에서 이어서 합니다">
          <p className="text-body-sm">
            {resumedFrom}단계({ONBOARDING_STEPS[resumedFrom - 1]?.label})까지 진행하셨습니다. 앞
            단계에서 저장한 내용은 그대로 남아 있고, "이전"으로 돌아가 고칠 수 있습니다.
          </p>
        </Callout>
      ) : null}

      {step === 1 ? (
        <IntroStep
          alreadyAcknowledged={reached > 1}
          saving={saving}
          error={stepError}
          onStart={() =>
            void saveAndGo(() => updateHousehold.mutateAsync({ onboardingStep: 2 }), 2, false)
          }
        />
      ) : null}

      {step === 2 ? (
        <RecipientStep
          alias={draft.alias}
          memo={draft.memo}
          saving={saving}
          error={stepError}
          onChange={({ alias, memo }) => setDraft((d) => ({ ...d, alias, memo }))}
          onBack={() => goTo(1)}
          onNext={({ alias, memo }) =>
            void saveAndGo(
              () =>
                updateHousehold.mutateAsync({
                  recipientAlias: alias,
                  recipientMemo: memo,
                  onboardingStep: 3,
                }),
              3,
              false,
            )
          }
        />
      ) : null}

      {step === 3 ? (
        <SensorsStep
          saving={saving}
          error={stepError}
          onBack={() => goTo(2)}
          onNext={() =>
            void saveAndGo(() => updateHousehold.mutateAsync({ onboardingStep: 4 }), 4, false)
          }
        />
      ) : null}

      {step === 4 ? (
        <ScheduleStep
          start={draft.nightStart}
          end={draft.nightEnd}
          saving={saving}
          error={stepError}
          onChange={({ start, end }) =>
            setDraft((d) => ({ ...d, nightStart: start, nightEnd: end }))
          }
          onBack={() => goTo(3)}
          onNext={({ start, end }) =>
            void saveAndGo(() => saveSchedule.mutateAsync({ nightStart: start, nightEnd: end }), 5)
          }
        />
      ) : null}

      {step === 5 ? (
        <AlertsStep
          prefs={draft.prefs}
          saving={saving}
          error={stepError}
          onChange={(prefs) => setDraft((d) => ({ ...d, prefs }))}
          onBack={() => goTo(4)}
          onNext={() => void saveAndGo(() => updatePrefs.mutateAsync(draft.prefs), 6)}
        />
      ) : null}

      {step === 6 ? (
        <ReviewStep
          household={household}
          detection={detection}
          prefs={toPrefsInput(alertPrefs)}
          sensors={sensors}
          completing={saving}
          error={stepError}
          onEdit={goTo}
          onBack={() => goTo(5)}
          onComplete={() => void complete()}
        />
      ) : null}
    </div>
  )
}
