import { useRouteTrail } from '@/app/routeHandle'
/**
 * 화면이 바뀌면 스크린리더에 새 화면 이름을 읽어 준다.
 * (화면 전체를 다시 불러오지 않는 앱에서는 이동했는지 알 방법이 없기 때문이다)
 */
export function RouteAnnouncer() {
  const title = useRouteTrail().current?.title
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {title ? `${title} 화면` : ''}
    </div>
  )
}
