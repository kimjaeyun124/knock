import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Crumb } from '@/app/routeHandle'

/**
 * 현재 위치까지의 이동 경로. 두 단계 이상 들어온 화면에서만 보여 준다. (PageContainer 가 판단)
 * 마지막 항목은 지금 화면이라 링크가 아니며 aria-current="page" 로 알린다.
 */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="현재 위치">
      <ol className="flex flex-wrap items-center gap-x-1 text-body-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={crumb.to} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="font-semibold text-ink">
                  {crumb.title}
                </span>
              ) : (
                <>
                  <Link
                    to={crumb.to}
                    className="inline-flex min-h-11 items-center rounded-control text-brand-strong underline"
                  >
                    {crumb.title}
                  </Link>
                  <ChevronRight aria-hidden="true" className="size-4 text-ink-muted" />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
