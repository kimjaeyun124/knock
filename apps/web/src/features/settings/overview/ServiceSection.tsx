import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useConnection } from '@/hooks/connectionContext'
import { useDevicePrefs } from '@/hooks/useDevicePrefs'
import { useOnline } from '@/hooks/useOnline'
import { useServerStatus } from '@/hooks/useServerStatus'
import { useSocketInfo } from '@/hooks/useSocketStatus'
import {
  REFRESH_CHOICES,
  TEXT_SIZES,
  THEME_CHOICES,
  type RefreshChoice,
  type TextSize,
  type ThemeChoice,
} from '@/lib/devicePrefs'
import { formatDateTime } from '@/lib/format'
import { queryKeys } from '@/lib/queryKeys'
import type { SocketStatus } from '@/lib/socket'
import { SelectField } from '@/components/ui/fields'

const THEME_LABELS: Record<ThemeChoice, { label: string; hint: string }> = {
  system: {
    label: '기기 설정 따르기',
    hint: '기기가 어두운 모드이면 어둡게, 아니면 밝게 보입니다.',
  },
  light: { label: '밝게', hint: '항상 밝은 화면을 씁니다.' },
  dark: { label: '어둡게', hint: '항상 어두운 화면을 씁니다. 밤에 눈부심을 줄입니다.' },
}

const TEXT_SIZE_LABELS: Record<TextSize, { label: string; hint: string }> = {
  normal: { label: '보통', hint: '기본 크기(16px)' },
  large: { label: '크게', hint: '15% 더 크게' },
  xlarge: { label: '아주 크게', hint: '30% 더 크게' },
}

const REFRESH_LABELS: Record<RefreshChoice, string> = {
  off: '끄기 (실시간 연결만 사용)',
  '30s': '30초마다',
  '1m': '1분마다',
  '5m': '5분마다',
}

const SOCKET_LABELS: Record<SocketStatus, string> = {
  idle: '아직 연결하지 않음',
  connecting: '연결하는 중',
  connected: '연결됨',
  disconnected: '끊김',
  error: '오류',
}

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  choices,
  labels,
  onChange,
}: {
  legend: string
  name: string
  value: T
  choices: readonly T[]
  labels: Record<T, { label: string; hint: string }>
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="text-body font-semibold">{legend}</legend>
      <div className="mt-2 space-y-2">
        {choices.map((choice) => (
          <label
            key={choice}
            className="flex min-h-12 cursor-pointer items-start gap-3 rounded-control border border-line-strong p-3"
          >
            <input
              type="radio"
              name={name}
              className="mt-1 size-5 accent-brand"
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            <span>
              <span className="block font-semibold">{labels[choice].label}</span>
              <span className="block text-body-sm text-ink-muted">{labels[choice].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** 시스템 연결 상태: 화면 상단의 연결 상태와 같은 값을 자세히 보여 준다. */
function ConnectionPanel() {
  const connection = useConnection()
  const online = useOnline()
  const server = useServerStatus()
  const socketInfo = useSocketInfo()
  const socket = socketInfo.status
  const queryClient = useQueryClient()
  const [checking, setChecking] = useState(false)

  const recheck = async () => {
    setChecking(true)
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.health })
    } finally {
      setChecking(false)
    }
  }
  const tone =
    connection.state === 'ok'
      ? 'ok'
      : connection.state === 'connecting'
        ? 'checking'
        : connection.state === 'unknown'
          ? 'muted'
          : 'danger'

  return (
    <Card title="시스템 연결 상태">
      <div className="space-y-3">
        <StatusBadge tone={tone}>{connection.label}</StatusBadge>
        <p>{connection.detail}</p>
        <dl className="divide-y divide-line">
          {[
            ['인터넷', online ? '연결됨' : '끊김'],
            [
              '서버',
              server.state === 'ok'
                ? `정상 응답 (버전 ${server.health.version})`
                : server.state === 'checking'
                  ? '확인하는 중'
                  : server.message,
            ],
            ['실시간 연결', SOCKET_LABELS[socket]],
            [
              '재연결',
              `지금 끊김에서 ${socketInfo.reconnectAttempts}번 시도 · 다시 연결에 성공한 횟수 ${socketInfo.reconnectCount}번`,
            ],
            [
              '실시간 연결을 마지막으로 시작한 시각',
              socketInfo.lastConnectedAt
                ? formatDateTime(socketInfo.lastConnectedAt.toISOString())
                : '아직 없음',
            ],
            ...(socketInfo.lastError ? [['마지막 연결 오류', socketInfo.lastError]] : []),
            [
              '마지막으로 정상이었던 시각',
              connection.lastOkAt ? formatDateTime(connection.lastOkAt.toISOString()) : '아직 없음',
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-4 py-2">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <Button
          variant="secondary"
          leadingIcon={RefreshCw}
          loading={checking}
          loadingText="확인하는 중…"
          onClick={() => void recheck()}
        >
          연결 다시 확인
        </Button>
        <p className="text-body-sm text-ink-muted">
          연결이 정상이 아니면 화면의 정보가 최신이 아닐 수 있고, 그동안의 알림은 받지 못할 수
          있습니다.
        </p>
      </div>
    </Card>
  )
}

/** 4. 서비스 설정: 테마 · 글자 크기 · 데이터 새로고침 · 시스템 연결 상태. (앞의 셋은 이 기기에만 저장된다) */
export function ServiceSection() {
  const { prefs, set } = useDevicePrefs()
  const queryClient = useQueryClient()
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refreshNow = async () => {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries()
      setRefreshedAt(new Date())
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <Card
        title="화면 테마와 글자 크기"
        description="이 기기(브라우저)에만 저장됩니다. 고르면 바로 적용되고, 서버에는 저장하지 않습니다."
      >
        <div className="space-y-6">
          <RadioGroup
            legend="화면 테마"
            name="theme"
            value={prefs.theme}
            choices={THEME_CHOICES}
            labels={THEME_LABELS}
            onChange={(value) => set('theme', value)}
          />
          <RadioGroup
            legend="글자 크기"
            name="text-size"
            value={prefs.textSize}
            choices={TEXT_SIZES}
            labels={TEXT_SIZE_LABELS}
            onChange={(value) => set('textSize', value)}
          />
          <p className="text-body-sm text-ink-muted">
            브라우저의 글자 크기·확대 설정도 그대로 적용됩니다. 두 설정을 함께 쓰면 더 크게
            보입니다.
          </p>
        </div>
      </Card>

      <Card title="데이터 새로고침">
        <div className="space-y-4">
          <p className="text-body-sm text-ink-muted">
            화면은 실시간 연결로 새 신호와 알림을 바로 받습니다. 연결이 불안하다면 정해진 간격으로
            서버의 최신 정보를 다시 읽게 할 수 있습니다. 이 기기에만 저장됩니다.
          </p>
          <SelectField
            label="자동 새로고침"
            hint="화면이 보이고 인터넷이 연결되어 있을 때만 다시 읽습니다."
            value={prefs.refresh}
            onChange={(event) => set('refresh', event.target.value as RefreshChoice)}
          >
            {REFRESH_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {REFRESH_LABELS[choice]}
              </option>
            ))}
          </SelectField>
          <Button
            variant="secondary"
            leadingIcon={RefreshCw}
            loading={refreshing}
            loadingText="새로 읽는 중…"
            onClick={() => void refreshNow()}
          >
            지금 새로고침
          </Button>
          {refreshedAt ? (
            <p role="status" className="font-semibold">
              {formatDateTime(refreshedAt.toISOString())}에 서버의 최신 정보를 요청했습니다.
            </p>
          ) : null}
        </div>
      </Card>

      <ConnectionPanel />
    </>
  )
}
