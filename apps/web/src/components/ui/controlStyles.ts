export type ControlSize = 'sm' | 'md' | 'lg'

/** 입력 칸·선택 칸이 함께 쓰는 높이. 모두 44px 이상이다. */
export const CONTROL_SIZES: Record<ControlSize, string> = {
  sm: 'min-h-11 text-body-sm',
  md: 'min-h-12 text-body',
  lg: 'min-h-14 text-body-lg',
}

/** 테두리 3:1 대비(line-strong), 오류는 두꺼운 위험색 테두리 + (Field 가 붙이는) 오류 문구로 알린다. */
export const CONTROL_BASE =
  'block w-full rounded-control border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-2 aria-[invalid=true]:border-status-danger'
