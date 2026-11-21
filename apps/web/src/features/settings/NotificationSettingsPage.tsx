import { useEffect, useState } from 'react'
import {
  CHANNEL_LABELS,
  type Channel,
  type ChannelTestResponse,
  type IntegrationStatus,
} from '@tetris/shared'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { IntegrationModeBadge } from '@/components/status/DomainBadges'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/lib/format'
import { socket } from '@/lib/socket'
import { CHANNEL_NOTES } from './channelNotes'
import {
  useChannelTest,
  useIntegrations,
  usePushConfig,
  usePushSubscriptions,
  useRemovePushSubscription,
} from './hooks'
import { usePushDevice } from './usePushDevice'

type TestOutcome = ChannelTestResponse | { error: string }

function resultText(outcome: TestOutcome): { tone: 'ok' | 'bad' | 'muted'; text: string } {
  // 요청 자체가 실패한 경우(서버에 닿지 못함 등)에는 status 가 없다.
  if (!('status' in outcome)) {
    return { tone: 'bad', text: `테스트를 보내지 못했습니다. ${outcome.error}` }
  }
  if (outcome.status === 'SENT') return { tone: 'ok', text: '전달되었습니다.' }
  if (outcome.status === 'NOT_CONFIGURED') {
    return { tone: 'muted', text: '연동되지 않은 채널이라 보내지 않았습니다.' }
  }
  return { tone: 'bad', text: `전달하지 못했습니다. ${outcome.error ?? ''}`.trim() }
}

function ChannelRow({
  item,
  outcome,
  testing,
  arrived,
  onTest,
}: {
  item: IntegrationStatus
  outcome: TestOutcome | undefined
  testing: boolean
  /** 앱 화면 채널의 테스트가 이 화면에 실제로 도착했는가 */
  arrived: boolean
  onTest: () => void
}) {
  const result = outcome ? resultText(outcome) : null
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{CHANNEL_LABELS[item.key]}</p>
        <IntegrationModeBadge mode={item.mode} />
      </div>
      <p className="text-sm text-ink-muted">{CHANNEL_NOTES[item.key]}</p>
      <p className="text-sm text-ink-muted">
        {item.lastSuccessAt
          ? `마지막 전달 성공: ${formatDateTime(item.lastSuccessAt)}`
          : '전달에 성공한 기록이 없습니다.'}
      </p>
      {item.mode === 'NOT_CONFIGURED' ? null : (
        <Button
          variant="secondary"
          aria-label={`${CHANNEL_LABELS[item.key]} 테스트 보내기`}
          disabled={testing}
          onClick={onTest}
        >
          {testing ? '보내는 중…' : '테스트 보내기'}
        </Button>
      )}
      {result ? (
        <p
          role={result.tone === 'bad' ? 'alert' : 'status'}
          className={result.tone === 'bad' ? 'text-status-danger' : 'text-ink'}
        >
          {result.text}
        </p>
      ) : null}
      {item.key === 'IN_APP' && arrived ? (
        <p role="status" className="text-status-ok">
          이 화면에 테스트 알림이 도착했습니다.
        </p>
      ) : null}
    </li>
  )
}

function PushCard() {
  const config = usePushConfig()
  const configured = config.data?.configured === true
  const subscriptions = usePushSubscriptions(configured)
  const device = usePushDevice(subscriptions.data?.subscriptions)
  const remove = useRemovePushSubscription()

  return (
    <Card title="이 기기에서 푸시 받기">
      {config.isError ? (
        <ErrorState
          title="푸시 설정을 확인하지 못했습니다"
          error={config.error}
          onRetry={() => void config.refetch()}
        />
      ) : !config.data ? (
        <LoadingState />
      ) : !config.data.configured ? (
        <Callout tone="info" title="서버에 브라우저 푸시가 설정되어 있지 않습니다">
          <p className="text-sm">
            서버 관리자가 푸시 키(VAPID)를 설정하면 쓸 수 있습니다. 그 전에는 앱 화면이 열려 있을
            때만 알림을 받을 수 있습니다.
          </p>
        </Callout>
      ) : !device.supported ? (
        <Callout tone="warn" title="이 브라우저는 푸시를 지원하지 않습니다">
          <p className="text-sm">
            iPhone·iPad에서는 Safari의 "홈 화면에 추가"로 설치한 웹앱에서만 푸시를 받을 수 있습니다.
            다른 브라우저에서 다시 시도해 보세요.
          </p>
        </Callout>
      ) : (
        <div className="space-y-4">
          {device.permission === 'denied' ? (
            <Callout tone="warn" title="이 사이트의 알림이 차단되어 있습니다">
              <p className="text-sm">
                브라우저 설정에서 이 사이트의 알림을 허용한 뒤 다시 시도해 주세요.
              </p>
            </Callout>
          ) : null}
          <p>
            {device.registered
              ? '이 기기는 푸시를 받도록 등록되어 있습니다. 앱 화면을 닫아 두어도 알림이 옵니다.'
              : '이 기기는 아직 등록되지 않았습니다. 등록하면 앱 화면을 닫아 두어도 알림을 받을 수 있습니다.'}
          </p>
          {device.registered ? (
            <Button
              variant="secondary"
              disabled={device.busy}
              onClick={() => void device.disable()}
            >
              이 기기 등록 해제
            </Button>
          ) : (
            <Button
              disabled={device.busy || device.permission === 'denied'}
              onClick={() => config.data.publicKey && void device.enable(config.data.publicKey)}
            >
              {device.busy ? '등록하는 중…' : '이 기기에서 푸시 받기'}
            </Button>
          )}
          {device.error ? (
            <p role="alert" className="text-status-danger">
              {device.error}
            </p>
          ) : null}

          <div>
            <h3 className="font-semibold">등록된 기기</h3>
            {subscriptions.isError ? (
              <p role="alert" className="text-status-danger">
                등록된 기기 목록을 불러오지 못했습니다.
              </p>
            ) : !subscriptions.data ? (
              <p className="text-ink-muted">불러오는 중…</p>
            ) : subscriptions.data.subscriptions.length === 0 ? (
              <p className="text-ink-muted">등록된 기기가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line">
                {subscriptions.data.subscriptions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {s.host}{' '}
                      <span className="text-sm text-ink-muted">
                        · {formatDateTime(s.createdAt)} 등록
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      aria-label={`${s.host} 등록 해제`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(s.id)}
                    >
                      해제
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {remove.isError ? (
              <p role="alert" className="text-status-danger">
                {remove.error.message}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  )
}

/** 알림이 어떤 방법으로 전달되는지 확인하고, 채널마다 테스트를 보낸다. */
export function NotificationSettingsPage() {
  const integrations = useIntegrations()
  const test = useChannelTest()
  const [outcomes, setOutcomes] = useState<Partial<Record<Channel, TestOutcome>>>({})
  const [testing, setTesting] = useState<Channel | null>(null)
  const [arrivedAt, setArrivedAt] = useState<string | null>(null)

  // 앱 화면 채널의 테스트는 "서버가 보냈다"가 아니라 이 화면에 실제로 도착해야 성공으로 본다.
  useEffect(() => {
    const onTest = (payload: { sentAt: string }) => setArrivedAt(payload.sentAt)
    socket.on('notification.test', onTest)
    return () => {
      socket.off('notification.test', onTest)
    }
  }, [])

  const runTest = (channel: Channel) => {
    setTesting(channel)
    setArrivedAt(null)
    test.mutate(channel, {
      onSuccess: (result) => setOutcomes((current) => ({ ...current, [channel]: result })),
      onError: (error) =>
        setOutcomes((current) => ({ ...current, [channel]: { error: error.message } })),
      onSettled: () => setTesting(null),
    })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-h1">알림 채널</h1>

      <Callout tone="warn" title="앱 화면 알림의 한계">
        <p className="text-sm">
          앱 화면 알림은 이 화면이 열려 있을 때만 전달됩니다. 주무시는 보호자를 깨우려면 푸시가
          필요합니다. 푸시가 연동되어 있지 않으면 화면을 닫아 두는 동안에는 알림을 받을 수 없습니다.
        </p>
      </Callout>

      <Card title="채널별 상태와 테스트">
        {integrations.isError ? (
          <ErrorState
            title="채널 상태를 불러오지 못했습니다"
            error={integrations.error}
            onRetry={() => void integrations.refetch()}
          />
        ) : !integrations.data ? (
          <LoadingState label="채널 상태를 불러오는 중" />
        ) : (
          <ul className="divide-y divide-line">
            {integrations.data.integrations.map((item) => (
              <ChannelRow
                key={item.key}
                item={item}
                outcome={outcomes[item.key]}
                testing={testing === item.key}
                arrived={item.key === 'IN_APP' && arrivedAt !== null}
                onTest={() => runTest(item.key)}
              />
            ))}
          </ul>
        )}
      </Card>

      <PushCard />
    </div>
  )
}
