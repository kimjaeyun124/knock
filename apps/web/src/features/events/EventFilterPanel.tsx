import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import {
  TIMELINE_ATTENTION_LEVELS,
  TIMELINE_EVENT_TYPES,
  type Sensor,
  type TimelineAttention,
  type TimelineEventType,
  type TimelineOrder,
} from '@tetris/shared'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SelectField, TextField } from '@/components/ui/fields'
import { TIMELINE_ATTENTION_LABELS, TIMELINE_TYPE_LABELS } from '@/lib/labels'
import type { EventFilters } from './filters'

interface EventFilterPanelProps {
  filters: EventFilters
  today: string
  onChange: (patch: Partial<EventFilters>) => void
  onReset: () => void
  isDefault: boolean
  rangeError: string | null
  /** 센서 목록. 불러오는 중이면 undefined */
  sensors: readonly Sensor[] | undefined
  sensorsFailed: boolean
}

/** 몇 가지 조건이 기본에서 바뀌어 있는지 (접힌 패널 머리글에 알려 준다) */
function appliedCount(filters: EventFilters): number {
  return [filters.sensorId, filters.type, filters.attention, filters.alert].filter(Boolean).length
}

/**
 * 필터 영역: 날짜 범위 · 센서 · 이벤트 종류 · 주의 수준 · 알림 발생 여부 · 정렬 · 초기화.
 * 좁은 화면에서는 접을 수 있고, 조건이 걸려 있으면 접은 상태에서도 몇 개인지 보인다.
 */
export function EventFilterPanel({
  filters,
  today,
  onChange,
  onReset,
  isDefault,
  rangeError,
  sensors,
  sensorsFailed,
}: EventFilterPanelProps) {
  // 넓은 화면에서는 펼쳐 두고, 좁은 화면에서는 접어 두어 기록이 먼저 보이게 한다.
  const [open, setOpen] = useState(
    () =>
      typeof window === 'undefined' ||
      !window.matchMedia ||
      window.matchMedia('(min-width: 768px)').matches,
  )
  const count = appliedCount(filters)

  return (
    <Card padding="sm" className="md:p-5">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-h3">
          <span>조건</span>
          <span className="text-body-sm font-normal text-ink-muted">
            {isDefault ? '기본 조건' : count > 0 ? `${count}개 조건 적용 중` : '기간·정렬 변경됨'}
          </span>
        </summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              data-event-filter-from=""
              label="시작 날짜"
              type="date"
              value={filters.from}
              max={today}
              error={rangeError}
              onChange={(event) => event.target.value && onChange({ from: event.target.value })}
            />
            <TextField
              label="종료 날짜"
              type="date"
              value={filters.to}
              max={today}
              onChange={(event) => event.target.value && onChange({ to: event.target.value })}
            />
            <SelectField
              label="센서"
              value={filters.sensorId}
              error={sensorsFailed ? '센서 목록을 불러오지 못했습니다.' : null}
              onChange={(event) => onChange({ sensorId: event.target.value })}
            >
              <option value="">모든 센서</option>
              {/* 주소에 센서가 있는데 목록에 없으면(삭제된 센서 등) 선택값이 사라지지 않게 남긴다 */}
              {filters.sensorId && !sensors?.some((sensor) => sensor.id === filters.sensorId) ? (
                <option value={filters.sensorId}>선택한 센서</option>
              ) : null}
              {sensors?.map((sensor) => (
                <option key={sensor.id} value={sensor.id}>
                  {sensor.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="이벤트 종류"
              value={filters.type}
              onChange={(event) => onChange({ type: event.target.value as TimelineEventType | '' })}
            >
              <option value="">모든 종류</option>
              {TIMELINE_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TIMELINE_TYPE_LABELS[type]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="주의 수준"
              value={filters.attention}
              onChange={(event) =>
                onChange({ attention: event.target.value as TimelineAttention | '' })
              }
            >
              <option value="">모든 수준</option>
              {TIMELINE_ATTENTION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {TIMELINE_ATTENTION_LABELS[level]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="알림 발생 여부"
              value={filters.alert}
              onChange={(event) => onChange({ alert: event.target.value as EventFilters['alert'] })}
            >
              <option value="">전체</option>
              <option value="true">알림이 발생한 기록</option>
              <option value="false">알림이 없는 기록</option>
            </SelectField>
            <SelectField
              label="정렬"
              value={filters.order}
              onChange={(event) => onChange({ order: event.target.value as TimelineOrder })}
            >
              <option value="desc">최신순</option>
              <option value="asc">오래된순</option>
            </SelectField>
          </div>
          <Button
            variant="secondary"
            leadingIcon={RotateCcw}
            disabled={isDefault}
            onClick={onReset}
          >
            조건 초기화
          </Button>
        </div>
      </details>
    </Card>
  )
}
