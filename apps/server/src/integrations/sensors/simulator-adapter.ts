import type { DataOrigin } from '@tetris/shared'
import { BaseSensorAdapter } from './base-adapter'
import type { NormalizeResult } from './types'

/**
 * 시뮬레이터용 어댑터. 실제 장치가 아니므로 realHardwareConnected 는 항상 false 이고,
 * 이 어댑터가 들여보내는 신호는 출처가 SIMULATED 인 센서에만 적용된다.
 * (연결·해제는 메모리 상태일 뿐 네트워크 통신이 없다)
 *
 * inject 는 시뮬레이터(또는 테스트)가 만든 신호를 실제 장치가 보낸 것처럼 같은 정규화 경로에 넣는다.
 */
export class SimulatorSensorAdapter extends BaseSensorAdapter {
  readonly id = 'simulator'
  readonly label = '센서 시뮬레이터'
  readonly origin: DataOrigin = 'SIMULATED'
  readonly protocol = null

  protected openConnection(): Promise<void> {
    return Promise.resolve()
  }

  protected closeConnection(): Promise<void> {
    return Promise.resolve()
  }

  /** 연결된 동안에만 신호를 받는다. 끊겨 있으면 버리지 않고 오류로 알린다. */
  async inject(raw: unknown): Promise<NormalizeResult> {
    if (this.state !== 'CONNECTED') {
      this.recordError('어댑터가 연결되어 있지 않아 신호를 받지 못했습니다.')
      return {
        ok: false,
        reason: 'NOT_AN_OBJECT',
        message: '어댑터가 연결되어 있지 않습니다.',
      }
    }
    return this.receive(raw)
  }
}
