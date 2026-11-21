import { Router } from 'express'
import { z } from 'zod'
import type { Services } from '@/container'
import { getAuth } from '@/middleware/require-auth'
import { sendData } from './http'

/** 바꿀 항목만 보낸다. 값의 형식·범위는 저장 전에 전체 규칙으로 다시 검증한다. */
const PatchSchema = z
  .strictObject({
    detection: z.record(z.string(), z.unknown()).optional(),
    alerts: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => v.detection !== undefined || v.alerts !== undefined, {
    message: '바꿀 항목을 하나 이상 보내 주세요. (detection 또는 alerts)',
  })

/** 설정 한 묶음. 시간대는 한국 표준시로 고정이라 바꿀 수 없다. */
async function load(services: Services, householdId: string) {
  return {
    timezone: 'Asia/Seoul',
    detection: await services.settings.get(householdId),
    alerts: await services.settings.getAlertPreferences(householdId),
  }
}

/** /api/v1/settings */
export function createSettingsController(services: Services): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    sendData(res, await load(services, getAuth(res).householdId))
  })

  router.patch('/', async (req, res) => {
    const patch = PatchSchema.parse(req.body)
    const { householdId } = getAuth(res)
    const saved = await services.settings.patch(householdId, patch)
    // 다른 기기에서 열려 있는 화면도 바뀐 설정을 바로 보게 한다.
    services.realtime.emitToHousehold(householdId, 'settings.updated', {
      settings: saved.detection,
    })
    await services.monitoring.publish(householdId)
    sendData(res, { timezone: 'Asia/Seoul', ...saved })
  })

  return router
}
