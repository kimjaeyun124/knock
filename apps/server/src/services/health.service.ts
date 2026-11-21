import { HealthResponseSchema, type HealthResponse } from '@tetris/shared'
import { SERVICE_NAME, SERVICE_VERSION } from '@/config/app-info'
import { AppError } from '@/utils/errors'

/**
 * 서버 상태 점검. 점검 항목이 하나라도 실패하면 정상 응답을 만들지 않고 503 오류를 던진다.
 * ("서버는 떠 있지만 DB는 안 되는" 상태가 정상으로 보이지 않게 한다.)
 * 응답은 내보내기 전에 공유 스키마로 검증해 계약이 어긋나지 않게 한다.
 */
export class HealthService {
  constructor(
    private readonly checkDatabase: () => Promise<void>,
    private readonly startedAtMs: number,
    private readonly now: () => Date,
  ) {}

  async check(): Promise<HealthResponse> {
    try {
      await this.checkDatabase()
    } catch (cause) {
      throw AppError.serviceUnavailable('데이터베이스에 연결할 수 없습니다.', { cause })
    }
    const nowMs = this.now().getTime()
    return HealthResponseSchema.parse({
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: new Date(nowMs).toISOString(),
      uptimeSeconds: Math.max(0, (nowMs - this.startedAtMs) / 1000),
      checks: { database: 'up' },
    })
  }
}
