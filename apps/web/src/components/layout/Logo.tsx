import { Link } from 'react-router'
import { PATHS, SERVICE_NAME } from '@/app/paths'
import { cn } from '@/lib/cn'

/**
 * 노크의 마크: 아치형 문 + 문고리 + 두드리는 소리(호). 장식이므로 스크린리더는 서비스 이름만 읽는다.
 * 문은 남보라(brand), 문고리는 노크 노랑(accent), 소리 호는 문과 같은 색이다.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={cn('size-8 text-brand', className)}>
      <path d="M5 28V14a8 8 0 0 1 16 0v14z" fill="currentColor" />
      <circle cx="16.8" cy="21.5" r="1.9" className="fill-accent" />
      <path
        d="M24.5 11.5a5.5 5.5 0 0 1 0 7M28 8.5a9.5 9.5 0 0 1 0 13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </svg>
  )
}

/** 서비스 로고와 이름. 누르면 대시보드로 간다. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to={PATHS.dashboard}
      className={cn(
        'inline-flex min-h-12 items-center gap-2.5 rounded-control px-2 text-h2 font-extrabold tracking-tight text-ink',
        className,
      )}
    >
      <Mark />
      <span>{SERVICE_NAME}</span>
    </Link>
  )
}
