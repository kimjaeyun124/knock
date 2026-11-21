import type { RequestHandler, Response } from 'express'
import type { Sensor as SensorRow } from '@/generated/prisma/client'
import type { DeviceAuthService } from '@/services/device-auth.service'
import { AppError } from '@/utils/errors'

/** 장치 토큰(Bearer)이 유효한 센서의 요청만 통과시킨다. 사용자용 쿠키 인증과는 별개다. */
export function createRequireDevice(deviceAuth: DeviceAuthService): RequestHandler {
  return async (req, res, next) => {
    res.locals.device = await deviceAuth.authenticate(req.header('authorization'))
    next()
  }
}

export function getDevice(res: Response): SensorRow {
  const device = res.locals.device as SensorRow | undefined
  if (!device) throw AppError.unauthorized('장치 인증 정보가 없습니다.')
  return device
}
