import { ONBOARDING_STEP_COUNT } from '@tetris/shared'

/** 초기 설정 6단계. 번호는 1부터이며 서버에 저장하는 onboardingStep 과 같다. */
export const ONBOARDING_STEPS = [
  { id: 'intro', label: '서비스 소개' },
  { id: 'recipient', label: '보호 대상' },
  { id: 'sensors', label: '센서' },
  { id: 'schedule', label: '모니터링 시간' },
  { id: 'alerts', label: '알림' },
  { id: 'review', label: '확인' },
] as const

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id']

/** 주소의 ?step= 값을 1~6 사이의 단계로. 잘못된 값이면 null */
export function parseStep(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const step = Number(value)
  return step >= 1 && step <= ONBOARDING_STEP_COUNT ? step : null
}

/**
 * 지금 열어야 할 단계.
 * - 주소에 단계가 있으면 그 단계. 다만 아직 도달하지 않은 뒤쪽 단계로 건너뛸 수는 없다.
 * - 없으면 서버에 저장된 단계(도중에 나갔다 돌아온 경우 거기서 이어 한다)
 */
export function resolveStep(requested: number | null, reached: number): number {
  return Math.min(requested ?? reached, reached)
}
