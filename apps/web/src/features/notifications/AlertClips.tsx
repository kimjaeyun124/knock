import { ALERT_CLIP_LIMITS } from '@tetris/shared'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/lib/format'
import { useAlertClips } from './hooks'

/**
 * 알림에 붙은 짧은 영상(시연용 웹캠). 영상이 없으면 아무것도 그리지 않는다.
 * 영상은 로그인한 보호자만 같은 출처에서 볼 수 있고, 보관 기간이 지나면 지워진다.
 */
export function AlertClips({ alertId }: { alertId: string }) {
  const query = useAlertClips(alertId)
  if (query.isError) {
    return (
      <Card title="알림과 함께 온 영상">
        <p role="alert" className="text-status-danger">
          영상 목록을 불러오지 못했습니다.
        </p>
      </Card>
    )
  }
  const clips = query.data?.clips ?? []
  if (clips.length === 0) return null
  return (
    <Card
      title="알림과 함께 온 영상"
      description={`시연용 웹캠이 알림이 만들어진 순간부터 약 ${ALERT_CLIP_LIMITS.recordMs / 1000}초 녹화한 영상입니다. ${ALERT_CLIP_LIMITS.retentionDays}일이 지나면 자동으로 지워집니다.`}
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {clips.map((clip, index) => (
          <li key={clip.id} className="space-y-1">
            <video
              controls
              preload="metadata"
              playsInline
              src={clip.url}
              aria-label={`알림 영상 ${index + 1}`}
              className="aspect-[4/3] w-full rounded-control bg-line object-cover"
            />
            <p className="text-caption text-ink-muted">
              {formatDateTime(clip.createdAt)}
              {clip.durationMs ? ` · 약 ${Math.round(clip.durationMs / 1000)}초` : ''}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
