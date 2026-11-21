import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  /** 사이드바와 화면 제목에 쓰는 이름 */
  label: string
  /** 폭이 좁은 하단 메뉴에서 쓰는 짧은 이름 */
  shortLabel: string
  icon: LucideIcon
  /** true면 정확히 이 경로일 때만 활성 표시 */
  end?: boolean
}
