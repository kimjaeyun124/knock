import { cn } from '@/lib/cn'

type SkeletonShape = 'line' | 'block' | 'circle'

const SHAPES: Record<SkeletonShape, string> = {
  line: 'h-4 rounded-control',
  block: 'h-24 rounded-card',
  circle: 'size-10 rounded-full',
}

/**
 * 불러오는 동안 자리를 잡아 주는 회색 상자. 순전히 눈으로 보는 장식이라 스크린리더에서는 숨긴다.
 * 반드시 "불러오는 중" 글자(role="status")와 함께 쓴다.
 */
export function Skeleton({
  shape = 'line',
  className,
}: {
  shape?: SkeletonShape
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse bg-line', SHAPES[shape], className)}
    />
  )
}

/** 여러 줄 글이 들어갈 자리. 마지막 줄은 짧게 해서 글처럼 보이게 한다. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 && lines > 1 ? 'w-2/3' : undefined} />
      ))}
    </div>
  )
}
