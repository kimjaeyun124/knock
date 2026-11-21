import type { DataSummaryResponse, DeleteSimulatedResponse } from '@tetris/shared'
import type { PrismaClient } from '@/db/client'

/** 실제 데이터와 시뮬레이션 데이터의 양을 보여 주고, 시뮬레이션 데이터만 지운다. */
export class DataService {
  private readonly deletedListeners: ((householdId: string) => void)[] = []

  constructor(private readonly prisma: PrismaClient) {}

  /** 시뮬레이션 데이터를 지운 뒤 알아야 하는 쪽(시뮬레이터)이 등록한다. */
  onSimulatedDeleted(listener: (householdId: string) => void): void {
    this.deletedListeners.push(listener)
  }

  async summary(householdId: string): Promise<DataSummaryResponse> {
    const count = async (origin: 'REAL' | 'SIMULATED') => {
      const [sensors, events, alerts] = await Promise.all([
        this.prisma.sensor.count({ where: { householdId, origin } }),
        this.prisma.movementEvent.count({ where: { householdId, origin } }),
        this.prisma.alert.count({ where: { householdId, origin } }),
      ])
      return { sensors, events, alerts }
    }
    return { simulated: await count('SIMULATED'), real: await count('REAL') }
  }

  /**
   * 출처가 SIMULATED 인 알림·움직임 기록·센서만 지운다. 실제 데이터는 건드리지 않는다.
   * (알림 → 움직임 기록 → 센서 순서. 알림의 근거·전달 기록은 함께 지워진다.)
   */
  async deleteSimulated(householdId: string): Promise<DeleteSimulatedResponse> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const alerts = await tx.alert.deleteMany({ where: { householdId, origin: 'SIMULATED' } })
      const events = await tx.movementEvent.deleteMany({
        where: { householdId, origin: 'SIMULATED' },
      })
      const sensors = await tx.sensor.deleteMany({ where: { householdId, origin: 'SIMULATED' } })
      return { sensors: sensors.count, events: events.count, alerts: alerts.count }
    })
    for (const listener of this.deletedListeners) listener(householdId)
    return { ok: true, deleted }
  }
}
