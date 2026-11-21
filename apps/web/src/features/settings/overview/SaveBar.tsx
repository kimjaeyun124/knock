import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/format'

/**
 * 저장 단추와 결과 표시. 저장 중에는 단추가 잠기고, 성공은 "저장했습니다", 실패는 이유와 함께
 * "서버에 저장되지 않았습니다"라고 알린다. (실패를 성공처럼 보이지 않게 한다)
 */
export function SaveBar({
  dirty,
  saving,
  error,
  savedAt,
  onSave,
  onReset,
  label = '저장',
}: {
  dirty: boolean
  saving: boolean
  error: string | null
  /** 가장 최근에 서버가 저장을 확인한 시각. 값을 고치면 null 이 된다. */
  savedAt: Date | null
  onSave: () => void
  onReset?: () => void
  label?: string
}) {
  return (
    <div className="space-y-2 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!dirty} loading={saving} loadingText="저장하는 중…" onClick={onSave}>
          {label}
        </Button>
        {onReset && dirty && !saving ? (
          <Button variant="ghost" onClick={onReset}>
            되돌리기
          </Button>
        ) : null}
        {dirty && !saving && !error ? (
          <span className="text-body-sm text-ink-muted">저장하지 않은 변경이 있습니다.</span>
        ) : null}
      </div>
      {savedAt && !dirty && !error ? (
        <p role="status" className="font-semibold text-status-ok">
          저장했습니다. ({formatTime(savedAt.toISOString())})
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-status-danger">
          저장하지 못했습니다. 서버에 반영되지 않았습니다. {error}
        </p>
      ) : null}
    </div>
  )
}
