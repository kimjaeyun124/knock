import type { ReactNode } from 'react'
import { useRouteTrail } from '@/app/routeHandle'
import { cn } from '@/lib/cn'
import { Breadcrumbs } from './Breadcrumbs'

/**
 * 본문의 너비·간격을 정하는 공통 틀. 화면마다 따로 너비를 정하지 않는다.
 * 경로가 두 단계 이상인 화면(예: 설정 > 감지 시간·민감도)에서만 이동 경로를 위에 붙인다.
 */
export function PageContainer({ children }: { children: ReactNode }) {
  const { crumbs, current } = useRouteTrail()
  return (
    <div
      className={cn(
        'mx-auto w-full space-y-6',
        current?.width === 'wide' ? 'max-w-5xl' : 'max-w-3xl',
      )}
    >
      {crumbs.length > 1 ? <Breadcrumbs crumbs={crumbs} /> : null}
      {children}
    </div>
  )
}
