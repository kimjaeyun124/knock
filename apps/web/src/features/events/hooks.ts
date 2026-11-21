import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { EventsQuery, TimelineFilter, TimelineQuery } from '@tetris/shared'
import { useApi } from '@/hooks/useApi'
import { queryKeys } from '@/lib/queryKeys'

/** 움직임 기록. 최신순이며 cursor 로 이어 읽는다. */
export function useEventPages(query: Omit<EventsQuery, 'cursor'>) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: queryKeys.events.list(query),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.events.list(pageParam ? { ...query, cursor: pageParam } : query, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

/**
 * 움직임 기록(타임라인). 움직임 신호와 센서 상태 변화(연결 끊김·복구·배터리 부족)를 시간순으로 합친 목록을
 * cursor 로 이어 읽는다. 조건·정렬은 서버가 적용한다.
 */
export function useTimelinePages(query: Omit<TimelineQuery, 'cursor'>, enabled = true) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: queryKeys.timeline.list(query),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.timeline.list(pageParam ? { ...query, cursor: pageParam } : query, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}

/** 같은 조건 전체(한 쪽이 아니라)의 건수와 최근 시각 */
export function useTimelineSummary(filter: TimelineFilter, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.timeline.summary(filter),
    queryFn: ({ signal }) => api.timeline.summary(filter, signal),
    enabled,
  })
}

/** 이벤트 하나의 상세. id 가 없으면(상세를 열지 않았으면) 읽지 않는다. */
export function useTimelineEvent(id: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.timeline.detail(id ?? ''),
    queryFn: ({ signal }) => api.timeline.get(id ?? '', signal),
    enabled: id !== null,
  })
}
