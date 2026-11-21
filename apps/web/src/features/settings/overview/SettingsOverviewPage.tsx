import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { PAGE_TITLES, PATHS } from '@/app/paths'
import { ErrorState, LoadingState } from '@/components/common/StateViews'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { useSensors } from '@/features/sensors/hooks'
import { useFeatures } from '@/hooks/useFeatures'
import { useAlertPreferences, useDetectionSettings } from '../hooks'
import { AlertsSection } from './AlertsSection'
import { BlockedSummary } from './BlockedSummary'
import { describeBlockedAlerts } from './blocked'
import { DetectionSection } from './DetectionSection'
import { MonitoringSection } from './MonitoringSection'
import { ServiceSection } from './ServiceSection'

const GROUPS = [
  { id: 'monitoring-group', label: '모니터링' },
  { id: 'detection-group', label: '감지' },
  { id: 'alerts-group', label: '알림' },
  { id: 'service-group', label: '서비스' },
] as const

const MORE = [
  {
    to: PATHS.settingsDetection,
    title: '감지 시간·민감도',
    hint: '고급 기준: 재알림 간격, 연결 끊김·배터리 기준, 기록 보관 기간',
  },
  {
    to: PATHS.settingsNotifications,
    title: '알림 채널',
    hint: '채널별 상태, 푸시 기기 등록, 테스트 발송',
  },
  {
    to: PATHS.settingsIntegrations,
    title: '연동 현황',
    hint: '외부 서비스가 실제로 연결되어 있는지',
  },
  {
    to: PATHS.settingsGuide,
    title: '감지 안내',
    hint: '어떤 움직임을 감지하고 어떤 것은 감지하지 못하는지',
  },
  {
    to: PATHS.settingsPassword,
    title: '비밀번호 변경',
    hint: '내 계정의 비밀번호 (다른 기기는 로그아웃됩니다)',
  },
  { to: PATHS.settingsData, title: '데이터 관리', hint: '보관 기간과 시뮬레이션 데이터' },
  { to: PATHS.notice, title: '서비스 안내와 한계', hint: '이 서비스가 하는 일과 하지 못하는 일' },
] as const

function GroupHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="pt-4 text-h2">
      {children}
    </h2>
  )
}

/**
 * 설정. 모든 항목이 실제 동작과 이어져 있다.
 *  - 모니터링·감지·알림: 서버 설정 API(저장하면 이후 들어오는 신호부터 이벤트 판단에 반영)
 *  - 서비스: 이 기기에만 저장되는 화면 설정과 연결 상태
 * 구역마다 따로 저장한다. 저장은 서버가 확인한 뒤에만 "저장했습니다"로 보인다.
 */
export function SettingsOverviewPage() {
  const detection = useDetectionSettings()
  const prefs = useAlertPreferences()
  const sensors = useSensors()
  const features = useFeatures()

  const failed = [detection, prefs, sensors].find((query) => query.isError)
  const ready = detection.data && prefs.data && sensors.data

  const blocked = ready
    ? describeBlockedAlerts({
        detection: detection.data,
        prefs: prefs.data,
        sensors: sensors.data.sensors,
      })
    : []
  const more = features.data?.simulatorEnabled
    ? [
        ...MORE,
        {
          to: PATHS.devSimulator,
          title: '센서 시뮬레이터',
          hint: '개발·시연용. 실제 센서 없이 신호와 상황을 만들어 봅니다',
        },
        {
          to: PATHS.devWebcam,
          title: '웹캠 움직임 감지',
          hint: '개발·시연용. 노트북 카메라로 움직임을 찾아 시뮬레이션 센서 신호로 보냅니다',
        },
      ]
    : MORE

  return (
    <div className="space-y-4">
      <PageHeader
        title={PAGE_TITLES.settings}
        description="구역마다 저장 단추가 있습니다. 저장하면 서버에 반영되고, 이후 들어오는 신호부터 새 설정으로 판단합니다."
      />
      <nav aria-label="설정 구역" className="flex flex-wrap gap-2">
        {GROUPS.map((group) => (
          <a
            key={group.id}
            href={`#${group.id}`}
            className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold"
          >
            {group.label}
          </a>
        ))}
      </nav>

      {failed ? (
        <ErrorState
          title="설정을 불러오지 못했습니다"
          error={failed.error}
          onRetry={() => {
            for (const query of [detection, prefs, sensors]) {
              if (query.isError) void query.refetch()
            }
          }}
        />
      ) : !ready ? (
        <LoadingState />
      ) : (
        <>
          <BlockedSummary items={blocked} />

          <GroupHeading id="monitoring-group">1. 모니터링 설정</GroupHeading>
          <MonitoringSection
            settings={detection.data}
            prefs={prefs.data}
            sensors={sensors.data.sensors}
          />

          <GroupHeading id="detection-group">2. 감지 설정</GroupHeading>
          <DetectionSection
            settings={detection.data}
            prefs={prefs.data}
            sensors={sensors.data.sensors}
          />

          <GroupHeading id="alerts-group">3. 알림 설정</GroupHeading>
          <AlertsSection settings={detection.data} prefs={prefs.data} />
        </>
      )}

      <GroupHeading id="service-group">4. 서비스 설정</GroupHeading>
      <ServiceSection />

      <GroupHeading id="more-group">그 밖의 설정</GroupHeading>
      <Card>
        <ul className="divide-y divide-line">
          {more.map(({ to, title, hint }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-ink-muted">{hint}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
