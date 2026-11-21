/** 한 번 알림 전달을 시도하는 최대 횟수 (첫 시도 포함). 모두 실패하면 전달 실패로 확정한다. */
export const DELIVERY_MAX_ATTEMPTS = 3

/** 실패한 뒤 다음 시도까지 기다리는 시간(초). 첫 실패 후 30초, 두 번째 실패 후 2분. */
export const DELIVERY_RETRY_DELAYS_SECONDS = [30, 120] as const

/** 확인하지 않은 긴급 알림을 다시 알리는 최대 횟수 */
export const REMINDER_MAX_COUNT = 3

/** 주기 점검 간격 */
export const MAINTENANCE_INTERVAL_MS = 30_000

/** 오래된 기록 정리 간격 */
export const PURGE_INTERVAL_MS = 60 * 60 * 1000
