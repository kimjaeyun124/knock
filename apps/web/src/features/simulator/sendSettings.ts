import type { SIMULATOR_MOTION_MODES, SimulatorMotionRequest } from '@tetris/shared'

export interface SendSettings {
  mode: (typeof SIMULATOR_MOTION_MODES)[number]
  count: string
  night: boolean
}

export const DEFAULT_SEND_SETTINGS: SendSettings = { mode: 'single', count: '5', night: false }

export const MODE_LABELS: Record<SendSettings['mode'], string> = {
  single: '움직임 1건',
  burst: '반복 전송 (같은 구역에서 여러 건을 한 번에)',
  duplicate: '중복 전송 (같은 이벤트를 두 번)',
  invalid: '잘못된 신호 (서버가 거부하고 수신 오류로 기록해야 함)',
}

/** 화면의 설정을 서버에 보낼 요청으로 바꾼다. 건수가 잘못되면 null. */
export function toMotionOptions(
  settings: SendSettings,
): Pick<SimulatorMotionRequest, 'mode' | 'count' | 'when'> | null {
  const when = settings.night ? 'night' : 'now'
  if (settings.mode !== 'burst') return { mode: settings.mode, when }
  const count = Number(settings.count)
  if (!Number.isInteger(count) || count < 2 || count > 20) return null
  return { mode: 'burst', count, when }
}
