import { describe, expect, it } from 'vitest'
import {
  DashboardSummarySchema,
  IntegrationsResponseSchema,
  SensorListResponseSchema,
} from '@tetris/shared'
import { createMockApiClient, MOCK_ADAPTER_SENTINEL } from './mock'

describe('Mock 어댑터', () => {
  it('응답에 mock: true 표식과 어댑터 표식이 붙는다', async () => {
    const response = await createMockApiClient().integrations?.list()
    expect(response).toMatchObject({ mock: true, mockSource: MOCK_ADAPTER_SENTINEL })
  })

  it('실제 응답과 같은 계약(스키마)을 따르고, 세 가지 연동 방식을 모두 보여 준다', async () => {
    const response = await createMockApiClient().integrations?.list()
    const parsed = IntegrationsResponseSchema.parse(response)
    expect(new Set(parsed.integrations.map((i) => i.mode))).toEqual(
      new Set(['REAL', 'MOCK', 'NOT_CONFIGURED']),
    )
  })

  it('점검 시각은 주입한 시계를 따른다', async () => {
    const fixed = new Date('2026-11-14T03:00:00.000Z')
    const response = await createMockApiClient(() => fixed).integrations?.list()
    expect(response?.integrations[0]?.lastSuccessAt).toBe('2026-11-14T03:00:00.000Z')
  })

  describe('대시보드 예시 데이터', () => {
    const fixed = new Date('2026-11-14T03:00:00.000Z')
    const summary = () => createMockApiClient(() => fixed).dashboard?.summary()

    it('실제 응답과 같은 DashboardSummary 계약을 따른다', async () => {
      const data = await summary()
      expect(() => DashboardSummarySchema.parse(data)).not.toThrow()
    })

    it('Mock 표식이 있고, 어떤 값도 실제 장치처럼 보이지 않는다', async () => {
      const data = await summary()
      expect(data).toMatchObject({ mock: true, mockSource: MOCK_ADAPTER_SENTINEL })
      for (const sensor of data?.sensors ?? []) {
        expect(sensor.name).toMatch(/^\(샘플\)/)
        expect(sensor.origin).toBe('SIMULATED')
        expect(sensor.id).toMatch(/^mock-/)
      }
      for (const event of data?.recentEvents ?? []) expect(event.origin).toBe('SIMULATED')
    })

    it('연결은 정상인데 배터리가 부족한 센서와 빠짐없는 7일 요약을 담는다', async () => {
      const data = await summary()
      expect(data?.sensors.some((s) => s.state === 'ONLINE' && s.batteryLevel === 'LOW')).toBe(true)
      expect(data?.weekly).toHaveLength(7)
      expect(data?.weekly.at(-1)?.date).toBe('2026-11-14')
      expect(data?.recentEvents).toHaveLength(5)
    })
  })

  describe('센서 Mock', () => {
    const fixed = () => new Date('2026-11-14T03:00:00.000Z')

    it('실제 응답 계약(스키마)을 따르고 Mock 표식이 붙는다', async () => {
      const api = createMockApiClient(fixed).sensors
      const list = await api?.list()
      expect(() => SensorListResponseSchema.parse(list)).not.toThrow()
      expect(list).toMatchObject({ mock: true, mockSource: MOCK_ADAPTER_SENTINEL })
      for (const sensor of list?.sensors ?? []) expect(sensor.name).toMatch(/^\(샘플\)/)
    })

    it('등록한 센서는 시뮬레이션이며 첫 신호 전이고 가짜 토큰을 받는다', async () => {
      const api = createMockApiClient(fixed).sensors
      const created = await api?.create({ name: '새 센서', zone: 'PATH' })
      expect(created?.sensor).toMatchObject({
        origin: 'SIMULATED',
        state: 'PENDING',
        lastSeenAt: null,
        zone: 'PATH',
      })
      expect(created?.deviceToken).toMatch(/^mock_not_a_real_token_/)
      expect((await api?.list())?.sensors).toHaveLength(4)
    })

    it('이름·구역·사용 여부를 고치고, 사용 중인 센서는 지울 수 없고, 끄면 지울 수 있다', async () => {
      const api = createMockApiClient(fixed).sensors
      const id = 'mock-path'
      const renamed = await api?.update(id, { name: '복도', zone: 'ENTRANCE' })
      expect(renamed?.sensor).toMatchObject({ name: '복도', zone: 'ENTRANCE' })
      await expect(api?.remove(id)).rejects.toMatchObject({ status: 409 })
      const off = await api?.update(id, { isActive: false })
      expect(off?.sensor).toMatchObject({ isActive: false, state: 'DISABLED' })
      await expect(api?.remove(id)).resolves.toMatchObject({ ok: true })
      await expect(api?.get(id)).rejects.toMatchObject({ status: 404 })
    })

    it('센서 수 제한을 서버와 같이 지킨다', async () => {
      const api = createMockApiClient(fixed).sensors
      for (let i = 0; i < 17; i += 1) await api?.create({ name: `센서 ${i}`, zone: 'BED_SIDE' })
      await expect(api?.create({ name: '넘침', zone: 'BED_SIDE' })).rejects.toMatchObject({
        status: 409,
      })
    })
  })
})
