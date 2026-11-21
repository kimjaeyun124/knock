import { isRouteErrorResponse, useRouteError } from 'react-router'
import { env } from '@/lib/env'
import { Button } from '@/components/ui/Button'

/** 화면을 그리다 예기치 못한 오류가 났을 때 보여 주는 최상위 오류 화면. */
export function RouteErrorPage() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)

  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">화면을 표시하지 못했습니다</h1>
      <p className="text-ink-muted">
        예기치 못한 문제가 생겼습니다. 새로고침해도 계속되면 관리자에게 알려 주세요.
      </p>
      {env.isDev ? (
        <pre className="overflow-auto rounded-control bg-status-danger-soft p-3 text-sm text-status-danger-strong">
          {detail}
        </pre>
      ) : null}
      <Button className="self-start" onClick={() => window.location.reload()}>
        새로고침
      </Button>
    </div>
  )
}
