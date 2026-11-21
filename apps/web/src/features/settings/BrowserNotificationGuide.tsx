import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { useBrowserNotificationState } from './useBrowserNotificationState'

/**
 * 브라우저 알림 안내. 권한은 보호자가 버튼을 눌렀을 때만 요청한다.
 * 허용하지 않아도 초기 설정은 계속할 수 있고, 등록되지 않았는데 등록된 것처럼 보이지 않는다.
 */
export function BrowserNotificationGuide() {
  const { state, device, retry } = useBrowserNotificationState()

  switch (state.kind) {
    case 'loading':
      return <LoadingState />
    case 'error':
      return (
        <ErrorState title="브라우저 알림 설정을 확인하지 못했습니다" error={null} onRetry={retry} />
      )
    case 'server-off':
      return (
        <Callout tone="info" title="이 서버에는 브라우저 푸시가 설정되어 있지 않습니다">
          <p className="text-body-sm">
            서버 관리자가 푸시 키를 설정하기 전에는 앱 화면이 열려 있을 때만 알림이 보입니다. 알림을
            놓치지 않으려면 화면을 열어 두세요.
          </p>
        </Callout>
      )
    case 'unsupported':
      return (
        <Callout tone="warn" title="이 브라우저는 푸시를 지원하지 않습니다">
          <p className="text-body-sm">
            iPhone·iPad에서는 Safari의 "홈 화면에 추가"로 설치한 웹앱에서만 받을 수 있습니다. 그
            전에는 앱 화면이 열려 있을 때만 알림이 보입니다.
          </p>
        </Callout>
      )
    case 'registered':
      return (
        <Callout tone="ok" title="이 기기는 브라우저 알림을 받도록 등록되어 있습니다">
          <p className="text-body-sm">
            앱 화면을 닫아 두어도 알림이 옵니다. 다만 기기가 꺼져 있거나 브라우저가 알림을 막으면
            받지 못할 수 있습니다.
          </p>
        </Callout>
      )
    case 'denied':
      return (
        <Callout tone="warn" title="이 사이트의 알림이 차단되어 있습니다">
          <p className="text-body-sm">
            브라우저 주소창 옆의 사이트 설정에서 알림을 허용한 뒤 이 화면으로 돌아와 다시 시도해
            주세요. 허용하지 않아도 다음 단계로 갈 수 있습니다.
          </p>
        </Callout>
      )
    case 'ready':
      return (
        <div className="space-y-3 rounded-card border border-line p-4">
          <h3 className="text-h3">브라우저 알림 받기 (선택)</h3>
          <p className="text-body-sm text-ink-muted">
            버튼을 누르면 브라우저가 이 사이트의 알림을 허용할지 묻습니다. 허용하면 앱 화면을 닫아
            두어도 알림을 받을 수 있습니다. 허용하지 않아도 다음 단계로 갈 수 있고, 나중에 설정 →
            알림 채널에서 바꿀 수 있습니다.
          </p>
          <Button
            variant="secondary"
            loading={device.busy}
            loadingText="등록하는 중…"
            onClick={() => void device.enable(state.publicKey)}
          >
            이 기기에서 알림 받기
          </Button>
          {device.error ? (
            <p role="alert" className="text-body-sm font-semibold text-status-danger">
              {device.error}
            </p>
          ) : null}
        </div>
      )
  }
}
