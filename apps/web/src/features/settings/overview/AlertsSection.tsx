import { useState } from 'react'
import { Link } from 'react-router'
import type { AlertPreferencesInput, DetectionSettings } from '@tetris/shared'
import { PATHS } from '@/app/paths'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { TextField } from '@/components/ui/fields'
import { Switch } from '@/components/ui/Switch'
import { useAlertSound } from '@/hooks/useAlertSound'
import { playAlertBeep } from '@/lib/soundPreference'
import { BrowserNotificationGuide } from '../BrowserNotificationGuide'
import { usePatchAlertPreferences, usePatchDetection } from '../hooks'
import { SaveBar } from './SaveBar'
import { useSaveState } from './useSection'

const COOLDOWN_MAX = 120

/** 센서 연결·배터리 알림 */
function SensorAlertsCard({ prefs }: { prefs: AlertPreferencesInput }) {
  const patch = usePatchAlertPreferences()
  const state = useSaveState()
  const [sensorIssues, setSensorIssues] = useState(prefs.sensorIssues)
  const [lowBattery, setLowBattery] = useState(prefs.lowBattery)
  const dirty = sensorIssues !== prefs.sensorIssues || lowBattery !== prefs.lowBattery

  return (
    <Card
      title="센서 장애·배터리 알림"
      description="센서가 멈추면 움직임을 받을 수 없으므로, 켜 두는 것을 권합니다."
    >
      <div className="space-y-4">
        <ul className="divide-y divide-line">
          <li className="space-y-2 py-4">
            <Switch
              label="센서 장애 알림"
              description="센서 신호가 끊기거나 다시 연결되었을 때 알립니다."
              checked={sensorIssues}
              disabled={patch.isPending}
              onCheckedChange={(next) => {
                state.clearSaved()
                setSensorIssues(next)
              }}
            />
            {!sensorIssues ? (
              <p className="text-body-sm font-semibold text-status-warn-strong">
                끄면 센서가 꺼지거나 연결이 끊겨도 알림이 오지 않습니다. 센서 화면과 대시보드에는
                연결 상태가 계속 표시됩니다.
              </p>
            ) : null}
          </li>
          <li className="space-y-2 py-4">
            <Switch
              label="배터리 부족 알림"
              description="센서 배터리가 부족하거나 거의 없을 때 알립니다."
              checked={lowBattery}
              disabled={patch.isPending}
              onCheckedChange={(next) => {
                state.clearSaved()
                setLowBattery(next)
              }}
            />
            {!lowBattery ? (
              <p className="text-body-sm font-semibold text-status-warn-strong">
                끄면 배터리가 떨어져 센서가 멈추기 전에 알림을 받지 못합니다. 배터리 상태는 센서
                화면에 계속 표시됩니다.
              </p>
            ) : null}
          </li>
        </ul>
        <SaveBar
          dirty={dirty}
          saving={patch.isPending}
          error={state.error}
          savedAt={state.savedAt}
          onSave={() => {
            state.start()
            patch.mutate(
              { sensorIssues, lowBattery },
              { onSuccess: state.succeeded, onError: state.failed },
            )
          }}
          onReset={() => {
            setSensorIssues(prefs.sensorIssues)
            setLowBattery(prefs.lowBattery)
          }}
        />
      </div>
    </Card>
  )
}

/** 중복 알림 간격 */
function CooldownCard({ settings }: { settings: DetectionSettings }) {
  const patch = usePatchDetection()
  const state = useSaveState()
  const [text, setText] = useState(String(settings.cooldownMinutes))
  const [error, setError] = useState<string | null>(null)
  const dirty = text !== String(settings.cooldownMinutes)
  const minutes = Number(text)

  const save = () => {
    const value = text.trim() === '' ? Number.NaN : Number(text)
    if (!Number.isInteger(value) || value < 1 || value > COOLDOWN_MAX) {
      setError(`간격은 1~${COOLDOWN_MAX}분 사이의 정수로 입력해 주세요.`)
      return
    }
    setError(null)
    state.start()
    patch.mutate({ cooldownMinutes: value }, { onSuccess: state.succeeded, onError: state.failed })
  }

  return (
    <Card title="중복 알림 간격">
      <div className="space-y-4">
        <TextField
          label="같은 종류의 알림을 다시 만들지 않는 시간 (분)"
          hint={`이 시간 안에 같은 종류의 신호가 또 감지되면 새 알림을 만들지 않고 이미 있는 알림에 합칩니다. (1–${COOLDOWN_MAX})`}
          type="number"
          inputMode="numeric"
          value={text}
          error={error}
          onChange={(event) => {
            state.clearSaved()
            setText(event.target.value)
          }}
        />
        {Number.isFinite(minutes) && minutes >= 60 ? (
          <Callout tone="warn" title="간격이 길면 새 상황을 늦게 알 수 있습니다">
            <p className="text-body-sm">
              {minutes}분 동안은 같은 종류의 신호가 또 감지되어도 새 알림이 오지 않습니다. 이미 있는
              알림을 확인하고 종료하면 다시 새 알림이 만들어집니다.
            </p>
          </Callout>
        ) : null}
        <SaveBar
          dirty={dirty}
          saving={patch.isPending}
          error={state.error}
          savedAt={state.savedAt}
          onSave={save}
          onReset={() => {
            setText(String(settings.cooldownMinutes))
            setError(null)
          }}
        />
      </div>
    </Card>
  )
}

/** 3. 알림 설정 */
export function AlertsSection({
  settings,
  prefs,
}: {
  settings: DetectionSettings
  prefs: AlertPreferencesInput
}) {
  const sound = useAlertSound()
  return (
    <>
      <Card title="브라우저 알림과 소리">
        <div className="space-y-5">
          <BrowserNotificationGuide />
          <Link
            to={PATHS.settingsNotifications}
            className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline"
          >
            채널별 상태 확인·테스트 알림·등록된 기기 보기
          </Link>
          <div className="space-y-2 border-t border-line pt-4">
            <Switch
              label="알림 소리"
              description="이 기기에서 화면이 열려 있을 때 새 알림이 오면 짧은 소리를 냅니다. 이 기기(브라우저)에만 저장됩니다. 화면이 닫혀 있을 때의 알림음은 기기의 알림 설정을 따릅니다."
              checked={sound.enabled}
              onCheckedChange={sound.setEnabled}
            />
            <Button variant="secondary" onClick={playAlertBeep}>
              소리 들어 보기
            </Button>
          </div>
        </div>
      </Card>

      <Card title="주요 이벤트 알림">
        <p>
          즉시 확인 권장 수준의 주요 이벤트는 <strong>현관 근처 움직임</strong>입니다. 지금{' '}
          <strong>
            {settings.monitoringEnabled && prefs.entranceApproach ? '받도록' : '받지 않도록'}
          </strong>{' '}
          설정되어 있습니다.
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">
          종류별로 켜고 끄는 곳은 ‘감지 설정 → 이벤트 판단 규칙과 알림’이고, 모니터링 전체를 켜고
          끄는 곳은 ‘모니터링’입니다.
        </p>
        <a
          href="#detect-events"
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-strong underline"
        >
          이벤트별 알림 설정으로 이동
        </a>
      </Card>

      <SensorAlertsCard prefs={prefs} />
      <CooldownCard settings={settings} />
    </>
  )
}
