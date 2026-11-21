/**
 * 시뮬레이터가 켜는 장애 주입 상태.
 * 지금은 "시뮬레이션 알림의 앱 화면 전달 실패" 하나뿐이며, 잊고 켜 두어도 일정 시간 뒤 저절로 꺼진다.
 * 실제 센서가 만든 알림에는 절대 영향을 주지 않는다. (FaultInjectingAdapter 가 출처를 확인한다)
 */
export const DELIVERY_FAILURE_TTL_MS = 10 * 60 * 1000

export class FaultInjector {
  private deliveryFailureUntil: number | null = null

  constructor(private readonly now: () => Date) {}

  enableDeliveryFailure(ttlMs: number = DELIVERY_FAILURE_TTL_MS): void {
    this.deliveryFailureUntil = this.now().getTime() + ttlMs
  }

  disableDeliveryFailure(): void {
    this.deliveryFailureUntil = null
  }

  isDeliveryFailureActive(): boolean {
    return this.deliveryFailureUntil !== null && this.now().getTime() < this.deliveryFailureUntil
  }

  deliveryFailureState(): { enabled: boolean; expiresAt: string | null } {
    const enabled = this.isDeliveryFailureActive()
    return {
      enabled,
      expiresAt:
        enabled && this.deliveryFailureUntil
          ? new Date(this.deliveryFailureUntil).toISOString()
          : null,
    }
  }
}
