import { useState } from 'react'

/** 한 구역의 저장 상태(저장 중·오류·저장한 시각)를 모은다. */
export function useSaveState() {
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  return {
    error,
    savedAt,
    start: () => setError(null),
    succeeded: () => setSavedAt(new Date()),
    failed: (cause: unknown) =>
      setError(cause instanceof Error ? cause.message : '잠시 뒤 다시 시도해 주세요.'),
    clearSaved: () => setSavedAt(null),
  }
}
