import {
  DASHBOARD_RECENT_EVENTS,
  DASHBOARD_WEEKLY_DAYS,
  buildDashboardSummary,
  type DashboardSummary,
} from '@tetris/shared'
import type { AlertService } from './alert.service'
import type { EventService } from './event.service'
import type { SensorService } from './sensor.service'
import type { SettingsService } from './settings.service'

/**
 * 대시보드 한 화면에 필요한 데이터를 한 번에 모아 준다. (GET /api/v1/dashboard/summary)
 * 하나라도 읽지 못하면 전체가 실패한다. 일부만 채운 응답이 "문제없음"처럼 보이지 않게 하려는 것이다.
 */
export class DashboardService {
  constructor(
    private readonly sensors: SensorService,
    private readonly events: EventService,
    private readonly alerts: AlertService,
    private readonly settings: SettingsService,
    private readonly now: () => Date,
  ) {}

  async summary(householdId: string, guardianId: string): Promise<DashboardSummary> {
    const now = this.now()
    const [sensors, recent, active, settings, weekly] = await Promise.all([
      this.sensors.list(householdId),
      this.events.list(householdId, { limit: DASHBOARD_RECENT_EVENTS }),
      this.alerts.list(householdId, guardianId, { status: ['OPEN', 'ACKNOWLEDGED'], limit: 100 }),
      this.settings.get(householdId),
      this.events.dailySummary(householdId, DASHBOARD_WEEKLY_DAYS, now),
    ])
    return buildDashboardSummary({
      now,
      sensors,
      recentEvents: recent.events,
      // 읽음 여부는 보호자별 값이라 요약에는 넣지 않는다.
      activeAlerts: active.alerts.map(({ read: _read, ...alert }) => alert),
      settings,
      weekly: weekly.days,
    })
  }
}
