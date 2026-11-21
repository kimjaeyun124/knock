import { useEffect, useState } from 'react'

/** 일정 간격으로 현재 시각을 갱신해 돌려준다. (화면의 날짜·시간, "지금 야간인가" 표시용) */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
