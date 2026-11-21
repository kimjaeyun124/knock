import { LogOut, Volume2, VolumeOff } from 'lucide-react'
import { useAlertSound } from '@/hooks/useAlertSound'
import { useLogout, useSession } from '@/hooks/useAuth'

const ICON_BUTTON =
  'inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-control border border-line px-3 text-label hover:bg-canvas'

/** 알림 소리와 로그아웃. 좁은 화면에서는 아이콘만 보이고, 이름은 스크린리더가 그대로 읽는다. */
export function AccountMenu() {
  const { data: session } = useSession()
  const logout = useLogout()
  const sound = useAlertSound()
  if (!session) return null

  const SoundIcon = sound.enabled ? Volume2 : VolumeOff
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        aria-pressed={sound.enabled}
        onClick={() => sound.setEnabled(!sound.enabled)}
        className={ICON_BUTTON}
      >
        <SoundIcon aria-hidden="true" className="size-5" />
        <span className="sr-only lg:not-sr-only">알림 소리 {sound.enabled ? '켜짐' : '꺼짐'}</span>
      </button>
      <span className="hidden text-body-sm text-ink-muted lg:inline">
        {session.guardian.displayName}
      </span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className={`${ICON_BUTTON} disabled:opacity-60`}
      >
        <LogOut aria-hidden="true" className="size-5" />
        <span className="sr-only sm:not-sr-only">
          {logout.isPending ? '로그아웃 중…' : '로그아웃'}
        </span>
      </button>
      {logout.isError ? (
        <span role="alert" className="basis-full text-right text-body-sm text-status-danger">
          로그아웃하지 못했습니다. {logout.error.message}
        </span>
      ) : null}
    </div>
  )
}
