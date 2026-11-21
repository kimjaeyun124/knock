import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import {
  alertFiltersToParams,
  isDefaultAlertFilters,
  parseAlertFilters,
  type AlertFilters,
} from './filters'

/** 알림 센터의 조건을 주소(쿼리)에 담는다. 새로고침·뒤로 가기·링크 공유로 같은 목록이 열린다. */
export function useAlertFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseAlertFilters(params), [params])
  return {
    filters,
    isDefault: isDefaultAlertFilters(filters),
    setFilters: (patch: Partial<AlertFilters>) =>
      setParams(alertFiltersToParams({ ...filters, ...patch }), { replace: true }),
    reset: () => setParams(new URLSearchParams(), { replace: true }),
  }
}
