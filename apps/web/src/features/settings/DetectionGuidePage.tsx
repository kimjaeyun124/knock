import {
  REPEATED_MIN_GAP_SECONDS,
  REPEATED_THRESHOLD,
  REPEATED_WINDOW_MINUTES,
  SENSITIVITY_LABELS,
  WEEKDAY_LABELS,
  ZONE_LABELS,
  type DetectionSettings,
  type Sensitivity,
} from '@tetris/shared'
import { Link } from 'react-router'
import { PATHS } from '@/app/paths'
import { QueryState } from '@/components/common/QueryState'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDetectionSettings } from './hooks'

/** 감지하는 것. 기준 숫자는 서버 규칙과 같은 공유 상수·설정값을 쓴다. */
function detectionRules(settings: DetectionSettings | undefined) {
  const windowMinutes = settings?.sequenceWindowMinutes ?? 10
  const reps = (s: Sensitivity) => REPEATED_THRESHOLD[s]
  return [
    {
      title: '현관 근처 움직임',
      level: '즉시 확인 권장',
      detail: `야간 모니터링 시간에 현관 센서가 움직임을 알리면 민감도와 관계없이 알립니다. 직전 ${windowMinutes}분 안에 침대 주변·이동 경로 신호도 있었다면 알림 문구와 근거 기록에 함께 보여 줍니다.`,
    },
    {
      title: '침대 주변 움직임',
      level: '확인 필요',
      detail: `민감도가 "${SENSITIVITY_LABELS.HIGH}"일 때만 알립니다. 그 밖에는 기록만 남습니다.`,
    },
    {
      title: '침대 주변에서 이동 경로로 이어진 움직임',
      level: '확인 필요',
      detail: `침대 주변 신호 뒤 ${windowMinutes}분 안에 이동 경로 신호가 이어지면 알립니다. 민감도가 "${SENSITIVITY_LABELS.MEDIUM}" 이상일 때 적용됩니다.`,
    },
    {
      title: '짧은 시간 동안 여러 구역의 움직임',
      level: '확인 필요',
      detail: `${REPEATED_WINDOW_MINUTES}분 안에 구역이 바뀐 횟수가 ${SENSITIVITY_LABELS.LOW} ${reps('LOW')}번 / ${SENSITIVITY_LABELS.MEDIUM} ${reps('MEDIUM')}번 / ${SENSITIVITY_LABELS.HIGH} ${reps('HIGH')}번 이상이면 알립니다. 직전 신호와 ${REPEATED_MIN_GAP_SECONDS}초 이상 떨어져 구역이 바뀐 경우만 세어, 이웃한 두 센서가 몇 초 사이로 번갈아 반응하는 것은 세지 않습니다.`,
    },
  ] as const
}

const ALWAYS_RULES = [
  {
    title: '센서 연결 끊김',
    detail: '정해 둔 시간 동안 센서 신호가 없으면 알립니다. 시간대와 관계없이 적용됩니다.',
  },
  {
    title: '센서 배터리 부족·위급',
    detail: '정해 둔 기준 아래로 내려가면 알립니다. 시간대와 관계없이 적용됩니다.',
  },
  {
    title: '알림 전달 실패',
    detail: '어떤 방법으로도 알림을 전달하지 못했을 때 알립니다. 끌 수 없습니다.',
  },
] as const

const ZONE_NOTES = [
  {
    zone: 'BED_SIDE',
    note: '침대 옆에 둔 센서의 범위 안 움직임. 침대를 벗어났는지는 알 수 없습니다.',
  },
  { zone: 'PATH', note: '복도·화장실 가는 길처럼 이동하는 곳의 움직임.' },
  { zone: 'ENTRANCE', note: '현관 근처의 움직임. 외출 여부는 알 수 없습니다.' },
] as const

const CANNOT = [
  '넘어지거나 쓰러진 것. 센서는 움직임이 있었다는 신호만 보냅니다.',
  '침대에서 일어났는지, 침대를 벗어났는지. 침대 옆 센서 하나로는 알 수 없습니다.',
  '밖으로 나갔는지, 길을 잃었는지. 현관 근처 움직임만 알 수 있습니다.',
  '움직임이 오랫동안 없는 것. 신호가 없는 상태는 "괜찮다"와 "센서 문제"를 구분하지 못해 연결 끊김으로만 알립니다.',
  '움직인 사람이 어르신인지, 다른 사람이나 반려동물인지.',
  '센서가 닿지 않는 곳의 움직임, 센서 연결이 끊긴 동안의 움직임.',
  '정해 둔 모니터링 시간 밖의 움직임에 대한 알림. 이때는 기록만 남습니다.',
] as const

function formatSchedule(settings: DetectionSettings): string {
  const days =
    settings.activeWeekdays.length === 7
      ? '매일'
      : settings.activeWeekdays.map((day) => WEEKDAY_LABELS[day]).join('·')
  return `${days} ${settings.nightStart} ~ ${settings.nightEnd}`
}

function CurrentSettings({ settings }: { settings: DetectionSettings }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      <div>
        <dt className="text-sm text-ink-muted">모니터링</dt>
        <dd className="font-semibold">
          {settings.monitoringEnabled ? '켜짐' : '꺼짐 (움직임은 기록만 하고 알리지 않습니다)'}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-ink-muted">야간 시간대</dt>
        <dd className="font-semibold">{formatSchedule(settings)}</dd>
      </div>
      <div>
        <dt className="text-sm text-ink-muted">민감도</dt>
        <dd className="font-semibold">{SENSITIVITY_LABELS[settings.sensitivity]}</dd>
      </div>
      <div>
        <dt className="text-sm text-ink-muted">침대에서 이동 경로까지 이어지는 시간</dt>
        <dd className="font-semibold">{settings.sequenceWindowMinutes}분</dd>
      </div>
    </dl>
  )
}

/**
 * 어떤 움직임을 감지하고 어떤 것은 감지하지 못하는지 보여 주는 안내.
 * 기준 숫자는 서버 규칙이 쓰는 값과 같은 곳(공유 상수·내 설정)에서 가져온다.
 * 정확도(%)나 확률은 보여 주지 않는다. 현장 데이터로 검증하지 않았기 때문이다.
 */
export function DetectionGuidePage() {
  const settings = useDetectionSettings()
  const rules = detectionRules(settings.data)

  return (
    <div className="space-y-4">
      <PageHeader
        title="감지 안내"
        description="이 서비스가 어떤 움직임을 알리고, 어떤 것은 알 수 없는지 정리했습니다."
      />

      <Card title="지금 설정">
        <QueryState
          query={settings}
          loadingLabel="설정을 불러오는 중"
          errorTitle="설정을 불러오지 못했습니다"
        >
          {(data) => (
            <div className="space-y-3">
              <CurrentSettings settings={data} />
              <Link
                to={PATHS.settingsDetection}
                className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
              >
                감지 시간·민감도 바꾸기
              </Link>
            </div>
          )}
        </QueryState>
      </Card>

      <Card title="움직임 센서가 보는 구역">
        <ul className="space-y-2">
          {ZONE_NOTES.map(({ zone, note }) => (
            <li key={zone}>
              <span className="font-semibold">{ZONE_LABELS[zone]}</span>
              <span className="text-ink-muted"> — {note}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="야간 모니터링 시간에 알리는 움직임">
        <ul className="divide-y divide-line">
          {rules.map((rule) => (
            <li key={rule.title} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <p className="font-semibold">
                {rule.title} <span className="font-normal text-ink-muted">· {rule.level}</span>
              </p>
              <p className="text-ink-muted">{rule.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-muted">
          보호자가 받지 않기로 한 종류의 알림은 만들어지지 않습니다. 움직임 기록에는 그대로
          남습니다. 사용을 꺼 둔 센서의 신호는 알림 판단에 쓰지 않습니다.
        </p>
      </Card>

      <Card title="시간대와 관계없이 알리는 것">
        <ul className="divide-y divide-line">
          {ALWAYS_RULES.map((rule) => (
            <li key={rule.title} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <p className="font-semibold">{rule.title}</p>
              <p className="text-ink-muted">{rule.detail}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="감지하지 못하는 것">
        <ul className="list-disc space-y-2 pl-5">
          {CANNOT.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </Card>

      <Callout tone="warn" title="정확도는 검증되지 않았습니다">
        <p>
          감지 기준은 시뮬레이터로 맞춘 초기값이며 실제 센서와 현장 데이터로 확인하지 않았습니다.
          그래서 정확도(%)를 표시하지 않습니다. 센서가 놓치거나 불필요하게 알릴 수 있으니, 알림이
          없다고 안심하지 말고 알림이 왔을 때는 직접 확인해 주세요.
        </p>
      </Callout>
    </div>
  )
}
