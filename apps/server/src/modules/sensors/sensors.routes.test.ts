import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApiErrorBodySchema,
  MAX_SENSORS_PER_HOUSEHOLD,
  SensorDeleteResponseSchema,
  SensorListResponseSchema,
  SensorResponseSchema,
  SensorWithTokenResponseSchema,
} from '@tetris/shared'
import { createTestContext, type TestContext, type TestHousehold } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { hashToken } from '@/utils/tokens'

describe('센서 관리 API', () => {
  let ctx: TestContext
  let a: TestHousehold
  let b: TestHousehold
  let clientA: TestClient
  let clientB: TestClient

  beforeAll(async () => {
    ctx = await createTestContext()
    a = await ctx.createHousehold()
    b = await ctx.createHousehold()
    clientA = await ctx.loginAs(a)
    clientB = await ctx.loginAs(b)
  })
  afterAll(async () => {
    await ctx.close()
  })

  async function createSensor(
    client: TestClient,
    body: unknown = { name: '안방 침대 옆', zone: 'BED_SIDE' },
  ) {
    const res = await client.post('/api/sensors', body)
    expect(res.status).toBe(201)
    return SensorWithTokenResponseSchema.parse(await res.json())
  }

  const errorOf = async (res: Response) => ApiErrorBodySchema.parse(await res.json()).error

  it('로그인하지 않으면 모든 엔드포인트가 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    const { sensor } = await createSensor(clientA)
    for (const [method, path] of [
      ['GET', '/api/sensors'],
      ['POST', '/api/sensors'],
      ['GET', `/api/sensors/${sensor.id}`],
      ['PATCH', `/api/sensors/${sensor.id}`],
      ['POST', `/api/sensors/${sensor.id}/rotate-token`],
      ['DELETE', `/api/sensors/${sensor.id}`],
    ] as const) {
      const res = await anonymous.request(
        path,
        method === 'GET' ? { method } : { method, body: {} },
      )
      expect(res.status, `${method} ${path}`).toBe(401)
    }
  })

  describe('등록', () => {
    it('센서를 등록하면 장치 토큰을 한 번 보여 주고, 첫 신호 전까지는 PENDING 이다', async () => {
      const { sensor, deviceToken } = await createSensor(clientA)
      expect(deviceToken.startsWith('tsn_')).toBe(true)
      expect(sensor).toMatchObject({
        name: '안방 침대 옆',
        zone: 'BED_SIDE',
        kind: 'MOTION',
        origin: 'REAL',
        isActive: true,
        state: 'PENDING',
        lastSeenAt: null,
        batteryPercent: null,
        batteryLevel: 'UNKNOWN',
      })
    })

    it('DB에는 토큰 원문이 아니라 해시만 저장된다', async () => {
      const { sensor, deviceToken } = await createSensor(clientA)
      const row = await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: sensor.id } })
      expect(row.tokenHash).toBe(hashToken(deviceToken))
      expect(row.tokenHash).not.toBe(deviceToken)
    })

    it('목록·상세 조회에는 토큰이 다시 나타나지 않는다', async () => {
      const { sensor, deviceToken } = await createSensor(clientA)
      const list = await (await clientA.get('/api/sensors')).text()
      const detail = await (await clientA.get(`/api/sensors/${sensor.id}`)).text()
      for (const text of [list, detail]) {
        expect(text).not.toContain(deviceToken)
        expect(text).not.toContain('tokenHash')
        expect(text).not.toContain('deviceToken')
      }
      SensorListResponseSchema.parse(JSON.parse(list))
      SensorResponseSchema.parse(JSON.parse(detail))
    })

    it('이름과 구역이 올바르지 않으면 400 이다', async () => {
      for (const body of [
        { name: '', zone: 'PATH' },
        { name: '   ', zone: 'PATH' },
        { name: 'x'.repeat(51), zone: 'PATH' },
        { name: '센서', zone: 'KITCHEN' },
        { name: '센서' },
        {},
      ]) {
        const res = await clientA.post('/api/sensors', body)
        expect(res.status, JSON.stringify(body)).toBe(400)
        expect((await errorOf(res)).code).toBe('VALIDATION_ERROR')
      }
    })

    it('요청에 origin 이나 kind 를 끼워 넣어도 실제(REAL) 센서로만 등록된다', async () => {
      const { sensor } = await createSensor(clientA, {
        name: '위조 시도',
        zone: 'PATH',
        origin: 'SIMULATED',
        kind: 'WEARABLE',
        tokenHash: 'attacker-chosen',
      })
      expect(sensor.origin).toBe('REAL')
      expect(sensor.kind).toBe('MOTION')
      const row = await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: sensor.id } })
      expect(row.tokenHash).not.toBe('attacker-chosen')
    })

    it(`한 가구에 ${MAX_SENSORS_PER_HOUSEHOLD}개까지만 등록할 수 있다`, async () => {
      const user = await ctx.createHousehold()
      const client = await ctx.loginAs(user)
      for (let i = 0; i < MAX_SENSORS_PER_HOUSEHOLD; i += 1) {
        await createSensor(client, { name: `센서 ${i}`, zone: 'PATH' })
      }
      const res = await client.post('/api/sensors', { name: '하나 더', zone: 'PATH' })
      expect(res.status).toBe(409)
      expect((await errorOf(res)).code).toBe('CONFLICT')
    })

    it('허용되지 않은 출처의 등록 요청은 403 이다', async () => {
      const res = await clientA.post(
        '/api/sensors',
        { name: '센서', zone: 'PATH' },
        { Origin: 'https://evil.example' },
      )
      expect(res.status).toBe(403)
    })
  })

  describe('수정', () => {
    it('이름·구역·사용 여부를 바꿀 수 있고, 하나만 보내도 된다', async () => {
      const { sensor } = await createSensor(clientA)
      const renamed = SensorResponseSchema.parse(
        await (
          await clientA.request(`/api/sensors/${sensor.id}`, {
            method: 'PATCH',
            body: { name: '거실 입구' },
          })
        ).json(),
      )
      expect(renamed.sensor).toMatchObject({ name: '거실 입구', zone: 'BED_SIDE', isActive: true })

      const moved = SensorResponseSchema.parse(
        await (
          await clientA.request(`/api/sensors/${sensor.id}`, {
            method: 'PATCH',
            body: { zone: 'ENTRANCE', isActive: false },
          })
        ).json(),
      )
      expect(moved.sensor).toMatchObject({ zone: 'ENTRANCE', isActive: false, state: 'DISABLED' })
    })

    it('바꿀 항목이 없거나 값이 올바르지 않으면 400 이다', async () => {
      const { sensor } = await createSensor(clientA)
      for (const body of [{}, { name: '' }, { zone: 'NOPE' }, { isActive: 'yes' }]) {
        const res = await clientA.request(`/api/sensors/${sensor.id}`, { method: 'PATCH', body })
        expect(res.status, JSON.stringify(body)).toBe(400)
      }
    })
  })

  describe('다른 가구의 센서', () => {
    it('조회·수정·재발급·삭제 모두 "없는 센서"와 똑같이 404 이고, 내용은 바뀌지 않는다', async () => {
      const { sensor, deviceToken } = await createSensor(clientA)
      await ctx.services.sensors.update(a.householdId, sensor.id, { isActive: false })

      const attempts = [
        clientB.get(`/api/sensors/${sensor.id}`),
        clientB.request(`/api/sensors/${sensor.id}`, { method: 'PATCH', body: { name: '탈취' } }),
        clientB.post(`/api/sensors/${sensor.id}/rotate-token`),
        clientB.request(`/api/sensors/${sensor.id}`, { method: 'DELETE' }),
        clientB.get('/api/sensors/does-not-exist'),
      ]
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(404)
        expect((await errorOf(res)).message).toBe('센서를 찾을 수 없습니다.')
      }

      const row = await ctx.prisma.sensor.findUniqueOrThrow({ where: { id: sensor.id } })
      expect(row.name).toBe('안방 침대 옆')
      expect(row.tokenHash).toBe(hashToken(deviceToken))

      const listB = SensorListResponseSchema.parse(await (await clientB.get('/api/sensors')).json())
      expect(listB.sensors.find((s) => s.id === sensor.id)).toBeUndefined()
    })
  })

  describe('토큰 재발급', () => {
    it('새 토큰을 한 번 보여 주고 이전 토큰은 즉시 쓸 수 없다', async () => {
      const { sensor, deviceToken: oldToken } = await createSensor(clientA)
      const rotated = SensorWithTokenResponseSchema.parse(
        await (await clientA.post(`/api/sensors/${sensor.id}/rotate-token`)).json(),
      )
      expect(rotated.deviceToken).not.toBe(oldToken)

      const send = (token: string) =>
        fetch(`${ctx.baseUrl}/api/ingest/v1/heartbeat`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        })
      expect((await send(oldToken)).status).toBe(401)
      expect((await send(rotated.deviceToken)).status).toBe(200)
    })
  })

  describe('삭제', () => {
    it('사용 중인 센서는 삭제할 수 없다 (먼저 "사용 안 함"으로)', async () => {
      const { sensor } = await createSensor(clientA)
      const res = await clientA.request(`/api/sensors/${sensor.id}`, { method: 'DELETE' })
      expect(res.status).toBe(409)
      expect((await errorOf(res)).message).toContain('사용 안 함')
      expect(await ctx.prisma.sensor.count({ where: { id: sensor.id } })).toBe(1)
    })

    it('비활성화한 센서는 기록과 함께 삭제되고, 지워진 개수를 알려 준다', async () => {
      const { id, token } = await ctx.createSensor(a.householdId)
      for (let i = 0; i < 3; i += 1) {
        await ctx.prisma.movementEvent.create({
          data: {
            householdId: a.householdId,
            sensorId: id,
            zone: 'PATH',
            origin: 'REAL',
            deviceEventId: `delete-evt-${i}`,
            occurredAt: new Date(),
          },
        })
      }
      await clientA.request(`/api/sensors/${id}`, { method: 'PATCH', body: { isActive: false } })

      const res = await clientA.request(`/api/sensors/${id}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(SensorDeleteResponseSchema.parse(await res.json())).toEqual({
        ok: true,
        deletedEvents: 3,
      })

      expect(await ctx.prisma.sensor.count({ where: { id } })).toBe(0)
      expect(await ctx.prisma.movementEvent.count({ where: { sensorId: id } })).toBe(0)
      expect((await clientA.get(`/api/sensors/${id}`)).status).toBe(404)

      const ingest = await fetch(`${ctx.baseUrl}/api/ingest/v1/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(ingest.status).toBe(401)
    })
  })
})
