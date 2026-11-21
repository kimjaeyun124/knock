import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionHeaderProps {
  title: string
  description?: ReactNode
  /** 오른쪽(좁은 화면에서는 아래)에 두는 버튼 */
  actions?: ReactNode
  /** 문서 구조상 제목 단계. 화면 제목(h1) 아래 구역은 2, 그 안의 카드는 3. */
  level?: 2 | 3 | 4
  /** 글자 크기만 정한다. md = H2, sm = H3 (제목 단계와는 별개) */
  size?: 'md' | 'sm'
  id?: string
  className?: string
}

/** 화면 안의 한 구역(또는 카드)의 제목 줄 */
export function SectionHeader({
  title,
  description,
  actions,
  level = 2,
  size = 'md',
  id,
  className,
}: SectionHeaderProps) {
  const Heading = `h${level}` as const
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <Heading id={id} className={size === 'md' ? 'text-h2' : 'text-h3'}>
          {title}
        </Heading>
        {description ? <p className="mt-1 text-body-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
