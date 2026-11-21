import { Router } from 'express'
import { z } from 'zod'
import {
  DataOriginSchema,
  SensorCreateSchema,
  SensorUpdateSchema,
  ZoneKindSchema,
  type Sensor,
} from '@tetris/shared'
import type { Services } from '@/container'
import { getAuth } from '@/middleware/require-auth'
import { IdParamSchema, OrderSchema, sendData } from './http'

const SORT_FIELDS = ['createdAt', 'name', 'lastSeenAt'] as const

/** 가구마다 센서는 최대 20개라 페이지를 나누지 않고 전체를 돌려준다. (meta.total 로 개수를 알린다) */
const ListQuerySchema = z.object({
  zone: ZoneKindSchema.optional(),
  origin: DataOriginSchema.optional(),
  /** 'true' / 'false'. 센서의 사용 여부 */
  enabled: z.enum(['true', 'false']).optional(),
  sort: z.enum(SORT_FIELDS).default('createdAt'),
  order: OrderSchema.default('asc'),
})

function sortSensors(sensors: Sensor[], sort: (typeof SORT_FIELDS)[number], order: 'asc' | 'desc') {
  const key = (sensor: Sensor): string => sensor[sort] ?? ''
  const sign = order === 'asc' ? 1 : -1
  // 마지막 신호가 없는 센서(null)는 오름차순에서 맨 앞, 내림차순에서 맨 뒤
  return [...sensors].sort(
    (a, b) => sign * key(a).localeCompare(key(b)) || a.id.localeCompare(b.id),
  )
}

/** /api/v1/sensors */
export function createSensorsController(services: Services): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const query = ListQuerySchema.parse(req.query)
    const all = await services.sensors.list(getAuth(res).householdId)
    const filtered = all.filter(
      (sensor) =>
        (!query.zone || sensor.zone === query.zone) &&
        (!query.origin || sensor.origin === query.origin) &&
        (query.enabled === undefined || sensor.isActive === (query.enabled === 'true')),
    )
    sendData(res, sortSensors(filtered, query.sort, query.order), {
      meta: { total: filtered.length },
    })
  })

  router.post('/', async (req, res) => {
    const input = SensorCreateSchema.parse(req.body)
    // 장치 토큰(deviceToken)은 이 응답에서 한 번만 볼 수 있다.
    sendData(res, await services.sensors.create(getAuth(res).householdId, input), { status: 201 })
  })

  router.get('/:id', async (req, res) => {
    const { id } = IdParamSchema.parse(req.params)
    sendData(res, await services.sensors.get(getAuth(res).householdId, id))
  })

  router.patch('/:id', async (req, res) => {
    const { id } = IdParamSchema.parse(req.params)
    const patch = SensorUpdateSchema.parse(req.body)
    sendData(res, await services.sensors.update(getAuth(res).householdId, id, patch))
  })

  router.delete('/:id', async (req, res) => {
    const { id } = IdParamSchema.parse(req.params)
    // 사용 중인 센서는 먼저 enabled=false(isActive)로 바꿔야 지울 수 있다. (409)
    sendData(res, await services.sensors.remove(getAuth(res).householdId, id))
  })

  return router
}
