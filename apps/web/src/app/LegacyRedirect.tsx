import { Navigate, useLocation, useParams } from 'react-router'

/**
 * 예전 주소를 새 주소로 넘긴다. 쿼리(?...)와 해시(#...)는 그대로 가져간다.
 * 이미 발송된 푸시 알림이나 저장해 둔 북마크가 계속 열리게 하기 위한 것이다.
 * `to` 안의 `:이름` 은 주소의 같은 이름 값으로 바뀐다. 예: '/notifications/:alertId'
 */
export function LegacyRedirect({ to }: { to: string }) {
  const params = useParams()
  const { search, hash } = useLocation()
  const target = to.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''))
  return <Navigate to={`${target}${search}${hash}`} replace />
}
