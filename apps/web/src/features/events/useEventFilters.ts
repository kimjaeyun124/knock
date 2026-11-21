import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useNow } from '@/hooks/useNow'
import {
  filtersToParams,
  isDefaultFilters,
  parseFilters,
  presetRange,
  todayKey,
  type EventFilters,
  type PeriodPreset,
} from './filters'

const EVENT_PARAM = 'event'

/**
 * 움직임 기록의 조건과 "열어 둔 상세"를 주소(쿼리)에 담아 관리한다.
 * 새로고침·뒤로 가기·링크 공유로 같은 목록과 같은 상세가 열린다.
 * 조건을 바꾸는 것은 기록에 쌓지 않고(replace), 상세를 여는 것은 쌓아서 뒤로 가기로 닫힌다.
 */
export function useEventFilters() {
  const [params, setParams] = useSearchParams()
  // 자정이 지나면 "오늘"이 바뀌므로 1분마다 다시 확인한다.
  const today = todayKey(useNow(60_000))
  const filters = useMemo(() => parseFilters(params, today), [params, today])
  const selectedId = params.get(EVENT_PARAM)

  const write = (next: EventFilters, options: { keepEvent: boolean; replace: boolean }) => {
    const nextParams = filtersToParams(next, today)
    const event = params.get(EVENT_PARAM)
    if (options.keepEvent && event) nextParams.set(EVENT_PARAM, event)
    setParams(nextParams, { replace: options.replace })
  }

  return {
    filters,
    today,
    isDefault: isDefaultFilters(filters, today),
    selectedId,
    /** 조건 일부를 바꾼다. (열어 둔 상세는 닫는다 — 조건이 바뀌면 그 기록이 목록에 없을 수 있다) */
    setFilters: (patch: Partial<EventFilters>) =>
      write({ ...filters, ...patch }, { keepEvent: false, replace: true }),
    setPreset: (preset: PeriodPreset) =>
      write({ ...filters, ...presetRange(preset, today) }, { keepEvent: false, replace: true }),
    reset: () => setParams(new URLSearchParams(), { replace: true }),
    openEvent: (id: string) => {
      const next = new URLSearchParams(params)
      next.set(EVENT_PARAM, id)
      setParams(next)
    },
    closeEvent: () => {
      const next = new URLSearchParams(params)
      next.delete(EVENT_PARAM)
      setParams(next, { replace: true })
    },
  }
}
