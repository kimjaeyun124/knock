/**
 * 노크 디자인 토큰 (웹과 같은 값, Claude Design 캔버스 "노크 앱·웹 디자인" 기준).
 * 상태는 항상 색 + 아이콘 + 글자로 알린다. 대비는 웹의 tokens.test.ts 와 같은 값이라 WCAG AA 를 지킨다.
 */
export const color = {
  canvas: '#F5F4FA',
  surface: '#FFFFFF',
  ink: '#1C1B2E',
  inkMuted: '#5A5772',
  inkInverse: '#FFFFFF',
  line: '#E7E5F1',
  lineStrong: '#7A7791',
  brand: '#4F46E5',
  brandStrong: '#3730A3',
  brandSoft: '#EEF0FF',
  accent: '#FFC24A',
  ok: '#1B7F43',
  okSoft: '#E7F5EC',
  okStrong: '#14582E',
  warn: '#A8550A',
  warnSoft: '#FFF3DC',
  warnStrong: '#7A3B05',
  danger: '#C62828',
  dangerSoft: '#FDEBEA',
  dangerStrong: '#9B1C1C',
  muted: '#5A5772',
  mutedSoft: '#EEEDF5',
  mutedStrong: '#46435C',
  video: '#2B2A3D',
} as const

export const radius = { control: 16, card: 22, pill: 999 } as const

export type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'brand'

export const tones: Record<Tone, { bg: string; fg: string; icon: string }> = {
  ok: { bg: color.okSoft, fg: color.okStrong, icon: color.ok },
  warn: { bg: color.warnSoft, fg: color.warnStrong, icon: color.warn },
  danger: { bg: color.dangerSoft, fg: color.dangerStrong, icon: color.danger },
  muted: { bg: color.mutedSoft, fg: color.mutedStrong, icon: color.muted },
  brand: { bg: color.brandSoft, fg: color.brandStrong, icon: color.brand },
}
