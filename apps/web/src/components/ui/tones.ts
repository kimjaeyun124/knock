import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

/** 상태의 의미. 색(Success/Warning/Danger)과 아이콘이 항상 함께 따라간다. */
export type StatusTone = 'ok' | 'checking' | 'warn' | 'danger' | 'muted'

export interface ToneStyle {
  /** 기본 아이콘. 색을 못 보는 사용자도 모양으로 구분할 수 있다. */
  icon: LucideIcon
  /** 아이콘을 돌려 "진행 중"임을 보여 줄지 */
  spin: boolean
  /** 옅은 바탕 */
  soft: string
  /** 옅은 바탕 위의 글자 (대비 4.5:1 이상) */
  text: string
  /** 흰 바탕 위의 아이콘·채움 */
  fill: string
  /** 강조 테두리 */
  border: string
}

/** 상태별 스타일의 단일 출처. StatusBadge·StatusIndicator·Callout·Toast 가 함께 쓴다. */
export const TONE_STYLES: Record<StatusTone, ToneStyle> = {
  ok: {
    icon: CircleCheck,
    spin: false,
    soft: 'bg-status-ok-soft',
    text: 'text-status-ok-strong',
    fill: 'text-status-ok',
    border: 'border-status-ok',
  },
  checking: {
    icon: LoaderCircle,
    spin: true,
    soft: 'bg-status-muted-soft',
    text: 'text-status-muted-strong',
    fill: 'text-status-muted',
    border: 'border-status-muted',
  },
  warn: {
    icon: TriangleAlert,
    spin: false,
    soft: 'bg-status-warn-soft',
    text: 'text-status-warn-strong',
    fill: 'text-status-warn',
    border: 'border-status-warn',
  },
  danger: {
    icon: CircleAlert,
    spin: false,
    soft: 'bg-status-danger-soft',
    text: 'text-status-danger-strong',
    fill: 'text-status-danger',
    border: 'border-status-danger',
  },
  muted: {
    icon: Info,
    spin: false,
    soft: 'bg-status-muted-soft',
    text: 'text-status-muted-strong',
    fill: 'text-status-muted',
    border: 'border-status-muted',
  },
}
