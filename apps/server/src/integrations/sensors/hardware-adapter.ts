import type { DataOrigin } from '@tetris/shared'
import { BaseSensorAdapter, type BaseAdapterOptions } from './base-adapter'

/**
 * 실제 하드웨어 어댑터의 확장 지점. 제조사·통신 방식이 정해지면 이 클래스를 상속해
 * openConnection / closeConnection / parseRaw(장치 형식 → 표준 이벤트 후보)를 구현하고,
 * 장치에서 신호를 받을 때 receive(raw)를 부른다. 판단 로직은 건드리지 않는다. (docs/HARDWARE_INTEGRATION.md)
 *
 * 연결에 성공해 상태가 CONNECTED 일 때만 "실제 하드웨어 연결됨"으로 보고된다.
 */
export abstract class HardwareSensorAdapter extends BaseSensorAdapter {
  readonly origin: DataOrigin = 'REAL'

  protected override get realHardwareConnected(): boolean {
    return true
  }
}

/**
 * 아직 하드웨어·통신 방식이 정해지지 않았음을 나타내는 자리. 아무 신호도 만들지 않고,
 * 연결을 시도하면 실패로 알리며, 상태는 항상 "연결된 장치 없음(NOT_CONFIGURED)"이다.
 */
export class UnconfiguredHardwareAdapter extends HardwareSensorAdapter {
  readonly id = 'hardware'
  readonly label = '실제 센서 어댑터'
  readonly protocol = null

  constructor(options: BaseAdapterOptions) {
    super(options)
    this.state = 'NOT_CONFIGURED'
  }

  protected openConnection(): Promise<void> {
    return Promise.reject(new Error('연결할 실제 센서 하드웨어가 설정되어 있지 않습니다.'))
  }

  protected closeConnection(): Promise<void> {
    return Promise.resolve()
  }

  override async connect(): Promise<void> {
    // 상태를 FAILED 로 바꾸지 않는다. 설정이 없다는 사실이 "연결 실패"로 보이면 안 된다.
    await this.openConnection()
  }

  override async reconnect(): Promise<void> {
    await this.openConnection()
  }
}
