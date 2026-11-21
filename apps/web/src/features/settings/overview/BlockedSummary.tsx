import { Callout } from '@/components/ui/Callout'
import type { BlockedItem } from './blocked'

/**
 * "지금 설정에서 전달되지 않는 알림". 설정 화면 맨 위에서 항상 보인다.
 * 위험(즉시 확인 권장 알림이 막힘)은 경고 색, 비어 있으면 안내만 하고 "안전하다"고 말하지 않는다.
 */
export function BlockedSummary({ items }: { items: readonly BlockedItem[] }) {
  if (items.length === 0) {
    return (
      <Callout tone="ok" title="지금 설정에서는 모든 종류의 알림이 전달됩니다">
        <p className="text-body-sm">
          알림이 만들어지는 조건(야간 시간·민감도·센서 연결)에 맞는 신호는 알림으로 이어집니다.
          센서가 놓치는 움직임은 알릴 수 없고, 알림이 없다고 해서 괜찮다는 뜻은 아닙니다.
        </p>
      </Callout>
    )
  }
  const danger = items.some((item) => item.level === 'danger')
  return (
    <Callout
      tone={danger ? 'danger' : 'warn'}
      title={
        danger
          ? '중요한 알림이 전달되지 않는 설정입니다'
          : '지금 설정에서 전달되지 않거나 줄어드는 알림이 있습니다'
      }
    >
      <ul className="mt-2 space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <p className="font-semibold">
              {item.level === 'danger' ? '중요 · ' : item.level === 'info' ? '참고 · ' : ''}
              {item.title}
            </p>
            <p className="text-body-sm">{item.detail}</p>
          </li>
        ))}
      </ul>
    </Callout>
  )
}
