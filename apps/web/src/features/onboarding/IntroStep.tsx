import { useState } from 'react'
import { ServiceLimits } from '@/components/common/ServiceLimits'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const FEATURES = [
  '침대 주변·이동 경로·현관에 둔 센서의 움직임을 시간순으로 기록합니다.',
  '정해 둔 야간 시간에 움직임이 이어지면 보호자에게 알립니다.',
  '센서 연결이 끊기거나 배터리가 부족하면 알립니다.',
  '알림을 읽었는지, 확인했는지, 마무리했는지를 따로 남깁니다.',
]

/** STEP 1. 서비스가 하는 일과 하지 못하는 일을 먼저 알린다. */
export function IntroStep({
  alreadyAcknowledged,
  onStart,
  saving,
  error,
}: {
  alreadyAcknowledged: boolean
  onStart: () => void
  saving: boolean
  error: string | null
}) {
  const [checked, setChecked] = useState(alreadyAcknowledged)
  return (
    <Card title="노크는 이런 서비스입니다">
      <div className="space-y-5">
        <p>
          밤사이 어르신의 움직임을 센서로 감지해, 보호자가 놓치지 않고 알 수 있게 돕는 도구입니다.
          설정은 5분 정도 걸리고, 중간에 멈춰도 이어서 할 수 있습니다.
        </p>
        <section aria-labelledby="intro-features">
          <h3 id="intro-features" className="text-h3">
            할 수 있는 일
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {FEATURES.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="intro-limits">
          <h3 id="intro-limits" className="text-h3">
            꼭 알아 두세요: 감지의 한계
          </h3>
          <div className="mt-2">
            <ServiceLimits />
          </div>
        </section>
        <label className="flex min-h-12 items-center gap-3 rounded-control border border-line-strong px-3 py-2">
          <input
            type="checkbox"
            className="size-5 accent-brand"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          위 내용을 읽었고, 이 서비스의 한계를 이해했습니다
        </label>
        <Button disabled={!checked} loading={saving} loadingText="저장하는 중…" onClick={onStart}>
          시작하기
        </Button>
        {error ? (
          <p role="alert" className="font-semibold text-status-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
