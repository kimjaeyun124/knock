import { useEffect } from 'react'
import { SERVICE_NAME } from './paths'
import { useRouteTrail } from './routeHandle'

/** 브라우저 탭 제목을 현재 화면 이름으로 맞춘다. (새로고침·뒤로 가기·탭 목록에서 어디인지 알 수 있다) */
export function useDocumentTitle(): void {
  const title = useRouteTrail().current?.title
  useEffect(() => {
    document.title = title ? `${title} · ${SERVICE_NAME}` : SERVICE_NAME
  }, [title])
}
