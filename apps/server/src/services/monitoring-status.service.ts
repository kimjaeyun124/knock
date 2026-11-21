import type { MonitoringStatus } from '@tetris/shared'
import { isMonitoredTime } from '@/domain/time'
import type { RealtimeGateway } from '@/realtime/gateway'
import type { SensorService } from './sensor.service'
import type { SettingsService } from './settings.service'

/**
 * 모니터링 상태 요약을 만들고, 바뀔 때 같은 가구의 열려 있는 화면에 알린다. (`monitoring.status`)
 * 알림 전달만으로 최신 상태를 보장하지 않는다. 연결이 끊겼다 돌아온 화면은 REST 로 다시 읽는다.
 */
export class MonitoringStatusService {
  constructor(
    private readonly settings: SettingsService,
    private readonly sensors: SensorService,
    private readonly gateway: RealtimeGateway,
    private readonly now: () => Date,
  ) {}

  async status(householdId: string): Promise<MonitoringStatus> {
    const [rules, sensors] = await Promise.all([
      this.settings.getRules(householdId),
      this.sensors.list(householdId),
    ])
    const now = this.now()
    const active = sensors.filter((sensor) => sensor.isActive)
    return {
      enabled: rules.monitoringEnabled,
      activeWeekdays: [...rules.activeWeekdays],
      nightStart: rules.nightStart,
      nightEnd: rules.nightEnd,
      monitoredNow: isMonitoredTime(now, rules),
      activeSensors: active.length,
      connectedSensors: active.filter((sensor) => sensor.state === 'ONLINE').length,
      evaluatedAt: now.toISOString(),
    }
  }

  /** 상태를 계산해 가구의 화면들에 보낸다. 실패해도 호출한 쪽(설정 저장·신호 수신)을 실패시키지 않는다. */
  async publish(householdId: string): Promise<void> {
    try {
      this.gateway.emitToHousehold(householdId, 'monitoring.status', {
        monitoring: await this.status(householdId),
      })
    } catch {
      // 상태 알림은 화면을 빨리 갱신하려는 신호일 뿐이다. 놓쳐도 화면은 다시 연결될 때 REST 로 맞춘다.
    }
  }
}
