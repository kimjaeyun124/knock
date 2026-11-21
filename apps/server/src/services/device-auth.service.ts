import { DEVICE_TOKEN_PREFIX } from '@tetris/shared'
import type { Sensor as SensorRow } from '@/generated/prisma/client'
import { AppError } from '@/utils/errors'
import type { RateLimiter } from '@/utils/rate-limiter'
import { parseBearerToken } from '@/utils/tokens'
import type { SensorService } from './sensor.service'

const INVALID_TOKEN = '장치 토큰이 없거나 올바르지 않습니다.'

/**
 * 장치(센서)가 보낸 요청의 인증과 요청 제한.
 * - 센서 하나가 한꺼번에 너무 많은 요청을 보내는 것을 막는다.
 * - 잘못된 토큰은 IP 로 차단하지 않고 거부만 한다. 토큰이 256비트 무작위 값이라 추측이 불가능하고,
 *   차단하면 같은 공유기 뒤의 정상 센서(예: 토큰 재발급 후 옛 토큰으로 재시도하는 센서)까지 막힐 수 있다.
 * - 사용자가 "사용 안 함"으로 끈 센서는 요청을 받지 않는다.
 */
export class DeviceAuthService {
  constructor(
    private readonly sensors: SensorService,
    private readonly perSensor: RateLimiter,
  ) {}

  async authenticate(authorization: string | undefined): Promise<SensorRow> {
    const token = parseBearerToken(authorization)
    const sensor = token?.startsWith(DEVICE_TOKEN_PREFIX)
      ? await this.sensors.findByDeviceToken(token)
      : null
    if (!sensor) {
      throw new AppError(401, 'UNAUTHORIZED', INVALID_TOKEN, {
        headers: { 'WWW-Authenticate': 'Bearer' },
      })
    }

    const limit = this.perSensor.consume(sensor.id)
    if (!limit.allowed) {
      throw AppError.rateLimited(
        '요청이 너무 많습니다. 잠시 후 다시 보내 주세요.',
        limit.retryAfterSeconds,
      )
    }
    if (!sensor.isActive) {
      throw AppError.forbidden(
        '이 센서는 앱에서 "사용 안 함"으로 설정되어 있어 신호를 받지 않습니다.',
      )
    }
    return sensor
  }
}
