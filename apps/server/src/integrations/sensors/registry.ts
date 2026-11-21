import type { SensorAdapterStatus } from '@tetris/shared'
import type { SensorAdapter } from './types'

/** 서버가 알고 있는 센서 어댑터 목록과 상태. 연결된 하드웨어가 없으면 없다고 그대로 알린다. */
export class SensorAdapterRegistry {
  constructor(private readonly adapters: readonly SensorAdapter[]) {}

  all(): readonly SensorAdapter[] {
    return this.adapters
  }

  get(id: string): SensorAdapter | undefined {
    return this.adapters.find((adapter) => adapter.id === id)
  }

  statuses(): SensorAdapterStatus[] {
    return this.adapters.map((adapter) => adapter.getStatus())
  }
}
