import { Outlet } from 'react-router'
import { useDocumentTitle } from './useDocumentTitle'

/** 모든 경로(로그인 전 화면 포함)의 가장 바깥. 탭 제목을 현재 화면에 맞춘다. */
export function RootLayout() {
  useDocumentTitle()
  return <Outlet />
}
