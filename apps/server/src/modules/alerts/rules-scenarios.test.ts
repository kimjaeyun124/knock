import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AlertListResponseSchema,
  FORBIDDEN_PHRASES,
  IngestEventsResponseSchema,
  type AlertItem,
} from '@tetris/shared'
import { evaluateMovementRules } from '@/domain/rules/movement-rules'
import type { RuleEvent } from '@/domain/rules/types'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { DAY, MINUTE, NIGHT, TestDevice } from '@/test-utils/scenario'

/**
 * 판단 엔진 시나리오 10가지 (docs/DETECTION_RULES.md).
 * 순수 함수(분류·규칙)는 입력만으로, 서비스 흐름은 실제 수집 API → DB → 규칙 → 알림 경로로 확인한다.
 * 이 엔진은 낙상·사고를 판정하지 않는다. 결과는 "센서 위치와 규칙에 따른 추정"이다.
 */

const kst = (text: string) => new Date(`${text.replace(' ', 'T')}:00+09:00`)
const schedule = {
  monitoringEnabled: true,
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  nightStart: '22:00',
  nightEnd: '06:00',
}

let counter = 0
function ev(
  zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE',
  at: string,
  extra: Partial<RuleEvent> = {},
): RuleEvent {
  counter += 1
  return {
    id: `evt${String(counter).padStart(3, '0')}`,
    sensorId: `sensor-${zone}`,
    sensorName: `${zone} 센서`,
    zone,
    occurredAt: kst(at),
    isLate: false,
    ...extra,
  }
}
const run = (events: RuleEvent[], sensitivity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM', over = {}) =>
  evaluateMovementRules({
    newEvents: events,
    recentEvents: events,
    settings: { ...schedule, sensitivity, sequenceWindowMinutes: 10, ...over },
    origin: 'REAL',
  })
const types = (list: { type: string }[]) => list.map((c) => c.type).sort()

describe('시나리오 1 — 낮 시간 침대 주변 감지', () => {
  it('어떤 민감도에서도 알림 후보가 없다 (모니터링 시간이 아님)', () => {
    for (const s of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      expect(run([ev('BED_SIDE', '2026-11-16 13:00')], s)).toEqual([])
    }
  })
})

describe('시나리오 2 — 야간 침대 주변 감지', () => {
  it('민감도 높음에서만 "침대 주변 움직임(추정)" 알림 후보가 만들어지고, 문구는 확정적이지 않다', () => {
    const high = run([ev('BED_SIDE', '2026-11-16 23:30')], 'HIGH')
    expect(types(high)).toEqual(['BED_AREA_ACTIVITY'])
    expect(high[0]).toMatchObject({ severity: 'NOTICE', mode: 'EVENT' })
    for (const phrase of FORBIDDEN_PHRASES)
      expect(`${high[0]?.title} ${high[0]?.message}`).not.toContain(phrase)
    expect(run([ev('BED_SIDE', '2026-11-16 23:30')], 'MEDIUM')).toEqual([])
    expect(run([ev('BED_SIDE', '2026-11-16 23:30')], 'LOW')).toEqual([])
  })
})

describe('시나리오 3 — 야간 현관 감지', () => {
  it('모든 민감도에서 "즉시 확인 권장" 후보가 만들어지고, 외출·실종을 단정하지 않는다', () => {
    for (const s of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      const [candidate] = run([ev('ENTRANCE', '2026-11-16 23:30')], s)
      expect(candidate).toMatchObject({ type: 'ENTRANCE_APPROACH', severity: 'URGENT' })
      const text = `${candidate?.title} ${candidate?.message}`
      for (const phrase of FORBIDDEN_PHRASES) expect(text).not.toContain(phrase)
      expect(text).not.toMatch(/외출했|실종/)
    }
  })
})

describe('시나리오 4 — 일반 이동 경로 감지', () => {
  it('이동 경로 신호 하나만으로는 알림 후보가 없다 (일반 움직임으로 기록만)', () => {
    expect(run([ev('PATH', '2026-11-16 23:30')], 'HIGH')).toEqual([])
  })
})

describe('시나리오 5 — 반복 감지', () => {
  const sequence = () => [
    ev('BED_SIDE', '2026-11-16 23:00'),
    ev('PATH', '2026-11-16 23:01'),
    ev('BED_SIDE', '2026-11-16 23:02'),
    ev('PATH', '2026-11-16 23:03'),
    ev('BED_SIDE', '2026-11-16 23:04'),
  ]
  it('구역 전환 횟수가 기준(낮음 6 / 보통 4 / 높음 3)에 이르면 "반복된 움직임" 후보가 만들어지고, 근거 신호를 모두 담는다', () => {
    const events = sequence() // 전환 4번
    expect(types(run(events, 'LOW'))).not.toContain('REPEATED_MOVEMENT')
    const medium = run(events, 'MEDIUM').find((c) => c.type === 'REPEATED_MOVEMENT')
    expect(medium).toBeDefined()
    expect(medium?.evidenceEventIds.length).toBe(5)
    expect(types(run(events.slice(0, 4), 'HIGH'))).toContain('REPEATED_MOVEMENT') // 전환 3번
  })
  it('같은 종류의 후보는 한 신호 묶음 안에서 하나로 합쳐진다 (RULE 4: 연속 움직임 요약)', () => {
    const merged = run(sequence(), 'HIGH').filter((c) => c.type === 'REPEATED_MOVEMENT')
    expect(merged).toHaveLength(1)
  })
})

describe('시나리오 10 — 자정을 지나는 감지 일정', () => {
  it('22:00~06:00 일정에서 자정 전·후 현관 신호가 모두 후보이고, 종료 시각(06:00)부터는 아니다', () => {
    for (const at of ['2026-11-16 23:30', '2026-11-17 00:30', '2026-11-17 05:59']) {
      expect(types(run([ev('ENTRANCE', at)]))).toEqual(['ENTRANCE_APPROACH'])
    }
    expect(run([ev('ENTRANCE', '2026-11-17 06:00')])).toEqual([])
    expect(run([ev('ENTRANCE', '2026-11-16 21:59')])).toEqual([])
  })
  it('요일 일정은 야간이 시작된 날 기준이다: 월요일만 켜면 화요일 새벽은 후보, 월요일 새벽은 아니다', () => {
    const mon = { activeWeekdays: [0] }
    expect(types(run([ev('ENTRANCE', '2026-11-17 03:00')], 'MEDIUM', mon))).toEqual([
      'ENTRANCE_APPROACH',
    ])
    expect(run([ev('ENTRANCE', '2026-11-16 03:00')], 'MEDIUM', mon)).toEqual([])
  })
})

describe('시나리오 9(엔진) — 꺼 둔 센서', () => {
  it('비활성 센서의 신호는 알림 후보가 되지 않는다', () => {
    expect(run([ev('ENTRANCE', '2026-11-16 23:30', { sensorEnabled: false })])).toEqual([])
  })
})

// ─────────── 서비스 흐름 (실제 수집 API → DB → 규칙 → 알림) ───────────

const contexts: TestContext[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.close()
})

async function fixture() {
  const ctx = await createTestContext()
  contexts.push(ctx)
  ctx.clock.set(NIGHT)
  const user = await ctx.createHousehold()
  const client = await ctx.loginAs(user)
  const make = async (zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE', name: string) => {
    const sensor = await ctx.createSensor(user.householdId, { zone, name })
    return { id: sensor.id, token: sensor.token, device: new TestDevice(ctx, sensor.token) }
  }
  const alerts = async (): Promise<AlertItem[]> =>
    AlertListResponseSchema.parse(await (await client.get('/api/alerts?limit=100')).json()).alerts
  const sendEvent = async (token: string, eventId: string, occurredAt?: Date) => {
    const res = await fetch(`${ctx.baseUrl}/api/ingest/v1/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            eventId,
            type: 'MOTION',
            ...(occurredAt ? { occurredAt: occurredAt.toISOString() } : {}),
          },
        ],
      }),
    })
    return {
      status: res.status,
      body: res.status === 200 ? IngestEventsResponseSchema.parse(await res.json()) : null,
    }
  }
  const eventCount = () =>
    ctx.prisma.movementEvent.count({ where: { householdId: user.householdId } })
  return { ctx, user, client, make, alerts, sendEvent, eventCount }
}

describe('시나리오 6 — 중복 eventId', () => {
  it('같은 이벤트를 여러 번 보내도 한 번만 저장되고 알림도 하나뿐이다 (동시에 보내도 같다)', async () => {
    const { make, sendEvent, eventCount, alerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const id = randomUUID()

    const sequential = [await sendEvent(door.token, id), await sendEvent(door.token, id)]
    expect(sequential.map((r) => r.body?.results[0]?.status)).toEqual(['ACCEPTED', 'DUPLICATE'])

    const other = randomUUID()
    const parallel = await Promise.all([1, 2, 3, 4].map(() => sendEvent(door.token, other)))
    const statuses = parallel.map((r) => r.body?.results[0]?.status)
    expect(statuses.filter((s) => s === 'ACCEPTED')).toHaveLength(1)
    expect(statuses.filter((s) => s === 'DUPLICATE')).toHaveLength(3)

    expect(await eventCount()).toBe(2)
    const list = await alerts()
    expect(list).toHaveLength(1) // 같은 종류는 하나의 알림에 합쳐진다
    expect(list[0]?.occurrences).toBe(2) // 서로 다른 두 이벤트만 셈 — 중복 전송은 세지 않는다
  })
})

describe('시나리오 7 — cooldown 중 감지', () => {
  it('센서별로 cooldown 안의 같은 유형은 새 알림 없이 합쳐지고, 기준 시간이 지나면 새 알림이 만들어진다', async () => {
    const { make, alerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    await door.device.motion()
    await door.device.motion(2 * MINUTE)
    let list = await alerts()
    expect(list).toHaveLength(1)
    expect(list[0]?.occurrences).toBe(2)

    await door.device.motion(30 * MINUTE) // 기본 cooldown 10분이 지남
    list = await alerts()
    expect(list).toHaveLength(2)
  })

  it('다른 센서의 같은 유형은 서로의 cooldown 에 가려지지 않는다 (센서별)', async () => {
    const { make, alerts } = await fixture()
    const front = await make('ENTRANCE', '앞문')
    const back = await make('ENTRANCE', '뒷문')
    await front.device.motion()
    await back.device.motion(MINUTE)
    expect((await alerts()).map((a) => a.type)).toEqual(['ENTRANCE_APPROACH', 'ENTRANCE_APPROACH'])
  })

  it('중요한 새 이벤트는 다른 유형의 cooldown 때문에 무시되지 않는다', async () => {
    const { client, ctx, user, make, alerts } = await fixture()
    await ctx.prisma.detectionSettings.create({
      data: { householdId: user.householdId, sensitivity: 'HIGH' },
    })
    const bed = await make('BED_SIDE', '침대 옆')
    const door = await make('ENTRANCE', '현관문')
    await bed.device.motion() // 침대 주변 움직임(주의)
    await door.device.motion(MINUTE) // cooldown 중에 현관(긴급)
    const types = (await alerts()).map((a) => a.type).sort()
    expect(types).toEqual(['BED_AREA_ACTIVITY', 'ENTRANCE_APPROACH'])
    expect(client).toBeTruthy()
  })

  it('사람이 알림을 종료하면 cooldown 안이어도 다음 신호는 새 알림이 된다', async () => {
    const { client, make, alerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    await door.device.motion()
    const first = (await alerts())[0]!
    const resolved = await client.post(`/api/alerts/${first.id}/resolve`, { resolution: 'CHECKED' })
    expect(resolved.status).toBe(200)
    await door.device.motion(MINUTE)
    expect(await alerts()).toHaveLength(2)
  })
})

describe('시나리오 8 — 연결이 끊긴 센서', () => {
  it('끊긴 센서가 다시 신호를 보내면 그 신호는 평소처럼 판단되고, 복구도 알려진다', async () => {
    const { ctx, make, alerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    await door.device.heartbeat()
    ctx.clock.advance(10 * MINUTE) // 기본 기준 5분이 지남
    await ctx.services.pipeline.checkSensorConnections()
    expect((await alerts()).map((a) => a.type)).toEqual(['SENSOR_OFFLINE'])

    await door.device.motion(30 * MINUTE)
    const types = (await alerts()).map((a) => a.type).sort()
    expect(types).toEqual(['ENTRANCE_APPROACH', 'SENSOR_OFFLINE', 'SENSOR_RESTORED'])
    const offline = (await alerts()).find((a) => a.type === 'SENSOR_OFFLINE')
    expect(offline?.status).toBe('RESOLVED')
  })
})

describe('시나리오 9 — 비활성화된 센서', () => {
  it('"사용 안 함"으로 꺼 둔 센서의 신호는 받지 않고, 저장도 알림도 없다', async () => {
    const { client, make, sendEvent, eventCount, alerts } = await fixture()
    const door = await make('ENTRANCE', '현관문')
    const off = await client.request(`/api/sensors/${door.id}`, {
      method: 'PATCH',
      body: { isActive: false },
    })
    expect(off.status).toBe(200)

    const result = await sendEvent(door.token, randomUUID())
    expect(result.status).toBe(403)
    expect(await eventCount()).toBe(0)
    expect(await alerts()).toEqual([])
  })
})

describe('분류의 저장 — 신호를 받을 때 정해 DB 에 남는다', () => {
  it('야간 침대 신호는 BED_EXIT_CANDIDATE, 야간 현관은 ENTRANCE_ACTIVITY, 이동 경로는 MOTION_DETECTED 로 저장된다', async () => {
    const { ctx, user, make } = await fixture()
    const bed = await make('BED_SIDE', '침대 옆')
    const path = await make('PATH', '복도')
    const door = await make('ENTRANCE', '현관문')
    await bed.device.motion()
    await path.device.motion(MINUTE)
    await door.device.motion(2 * MINUTE)
    const rows = await ctx.prisma.movementEvent.findMany({
      where: { householdId: user.householdId },
      orderBy: { occurredAt: 'asc' },
    })
    expect(rows.map((r) => r.eventClass)).toEqual([
      'BED_EXIT_CANDIDATE',
      'MOTION_DETECTED',
      'ENTRANCE_ACTIVITY',
    ])
  })

  it('낮에 받은 신호는 구역과 상관없이 MOTION_DETECTED 이고 알림이 없다. 이후 설정을 바꿔도 과거 분류는 그대로다', async () => {
    const { ctx, user, make, alerts } = await fixture()
    ctx.clock.set(DAY)
    const door = await make('ENTRANCE', '현관문')
    const bed = await make('BED_SIDE', '침대 옆')
    await door.device.motion(-0)
    await bed.device.motion(-0)
    expect(await alerts()).toEqual([])
    await ctx.prisma.detectionSettings.create({
      data: { householdId: user.householdId, nightStart: '00:00', nightEnd: '23:59' },
    })
    const classes = (
      await ctx.prisma.movementEvent.findMany({ where: { householdId: user.householdId } })
    ).map((r) => r.eventClass)
    expect(classes).toEqual(['MOTION_DETECTED', 'MOTION_DETECTED'])
  })
})
