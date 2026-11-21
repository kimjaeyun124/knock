import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SectionHeader } from './SectionHeader'

type CardVariant = 'default' | 'subtle'
type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<CardVariant, string> = {
  /** 흰 카드: 대부분의 내용 */
  default: 'bg-surface',
  /** 바탕색 카드: 카드 안의 보조 묶음 */
  subtle: 'bg-canvas',
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5 md:p-6',
  lg: 'p-6 md:p-8',
}

interface CardProps {
  title?: string
  description?: ReactNode
  /** 제목 줄 오른쪽에 둘 버튼 */
  actions?: ReactNode
  /** 제목의 문서 구조상 단계. 기본 2 */
  headingLevel?: 2 | 3 | 4
  variant?: CardVariant
  padding?: CardPadding
  as?: ElementType
  className?: string
  children?: ReactNode
}

export function Card({
  title,
  description,
  actions,
  headingLevel = 2,
  variant = 'default',
  padding = 'md',
  as: Component = 'section',
  className,
  children,
}: CardProps) {
  return (
    <Component className={cn('rounded-card', VARIANTS[variant], PADDING[padding], className)}>
      {title ? (
        <SectionHeader
          title={title}
          description={description}
          actions={actions}
          level={headingLevel}
          size="sm"
          className="mb-3"
        />
      ) : null}
      {children}
    </Component>
  )
}
