import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'

/**
 * 장치 토큰은 발급 직후 이 화면에서 한 번만 볼 수 있다. 서버에는 해시만 저장되어 다시 확인할 수 없다.
 * 토큰은 이 컴포넌트가 화면에 있는 동안만 메모리에 있고, 저장소나 주소에 남기지 않는다.
 */
export function TokenReveal({ token, title }: { token: string; title: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <Callout tone="warn" title={title}>
      <p>이 토큰은 지금 한 번만 볼 수 있습니다. 화면을 벗어나면 다시 확인할 수 없습니다.</p>
      <p className="text-sm">
        센서(장치) 설정에 입력해 주세요. 다른 사람에게 보여 주거나 메신저로 보내지 마세요. 분실하면
        센서 상세 화면에서 새로 발급할 수 있습니다.
      </p>
      <code
        data-testid="device-token"
        className="mt-2 block select-all break-all rounded-control border border-line bg-surface p-3 font-mono text-sm"
      >
        {token}
      </code>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void copy()}>
          토큰 복사
        </Button>
        {copyState === 'copied' ? <span role="status">복사했습니다.</span> : null}
        {copyState === 'failed' ? (
          <span role="alert" className="text-status-danger">
            복사하지 못했습니다. 위 토큰을 직접 선택해서 복사해 주세요.
          </span>
        ) : null}
      </div>
    </Callout>
  )
}
