import { useMatches } from 'react-router'

/**
 * 경로 정의의 `handle` 에 붙이는 화면 정보.
 * 문서 제목·스크린리더 안내·이동 경로(Breadcrumbs)가 모두 이 값에서 나온다.
 */
export interface RouteHandle {
  /** 화면 이름 */
  title: string
  /**
   * 주소 구조(중첩)에 없는 상위 화면. 이동 경로에서 이 화면 앞에 붙는다.
   * 예: /dev/simulator 는 "설정 > 센서 시뮬레이터"
   */
  parent?: { title: string; to: string }
  /** 본문 너비. 기본은 읽기 편한 폭(default), 카드가 여러 열로 놓이는 화면은 wide */
  width?: 'default' | 'wide'
}

export interface Crumb {
  title: string
  to: string
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null && 'title' in value
}

export function readHandle(value: unknown): RouteHandle | undefined {
  return isRouteHandle(value) ? value : undefined
}

/** 현재 경로까지의 화면 목록. 앞에서부터 상위 → 하위 순서다. */
export function buildTrail(matches: readonly { pathname: string; handle?: unknown }[]): {
  crumbs: Crumb[]
  current: RouteHandle | undefined
} {
  const crumbs: Crumb[] = []
  let current: RouteHandle | undefined
  for (const match of matches) {
    const handle = readHandle(match.handle)
    if (!handle) continue
    if (handle.parent) crumbs.push(handle.parent)
    // 같은 경로에 겹친 정의(상위 index 등)가 있어도 한 번만 넣는다.
    if (crumbs[crumbs.length - 1]?.to !== match.pathname) {
      crumbs.push({ title: handle.title, to: match.pathname })
    }
    current = handle
  }
  return { crumbs, current }
}

export function useRouteTrail() {
  return buildTrail(useMatches())
}
