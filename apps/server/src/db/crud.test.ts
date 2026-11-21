import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '@/test-utils/context'

/**
 * 실제 SQLite(마이그레이션을 모두 적용한 임시 DB)에서 모델별 생성·조회·수정·삭제와
 * 제약조건(유일성·외래키·삭제 시 연쇄 정책)·인덱스를 확인한다. 정책 설명은 docs/DATABASE.md.
 */
describe('DB CRUD·제약조건', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  async function household() {
    const h = await ctx.createHousehold()
    return h.householdId
  }
  const newSensor = (householdId: string, extra: Record<string, unknown> = {}) =>
    ctx.prisma.sensor.create({
      data: {
        householdId,
        name: '테스트 센서',
        zone: 'PATH',
        origin: 'SIMULATED',
        tokenHash: `hash-${Math.random()}`,
        ...extra,
      },
    })

  describe('생성·조회·수정·삭제와 수정 시각(updatedAt)', () => {
    it('보호자·보호 대상·센서를 고치면 updatedAt 이 바뀌고 createdAt 은 그대로다', async () => {
      const householdId = await household()
      const guardian = await ctx.prisma.guardian.findFirstOrThrow({ where: { householdId } })
      const recipient = await ctx.prisma.careRecipient.findUniqueOrThrow({ where: { householdId } })
      const sensor = await newSensor(householdId)
      await sleep(5)

      const guardianAfter = await ctx.prisma.guardian.update({
        where: { id: guardian.id },
        data: { displayName: '수정된 이름' },
      })
      const recipientAfter = await ctx.prisma.careRecipient.update({
        where: { id: recipient.id },
        data: { alias: '엄마', memo: '메모' },
      })
      const sensorAfter = await ctx.prisma.sensor.update({
        where: { id: sensor.id },
        data: { name: '수정된 센서', sensitivity: 'HIGH' },
      })

      for (const [before, after] of [
        [guardian, guardianAfter],
        [recipient, recipientAfter],
        [sensor, sensorAfter],
      ] as const) {
        expect(after.createdAt.getTime()).toBe(before.createdAt.getTime())
        expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
      }
      expect(sensorAfter).toMatchObject({ name: '수정된 센서', sensitivity: 'HIGH' })
      expect(recipientAfter).toMatchObject({ alias: '엄마', memo: '메모' })
    })

    it('새 행의 updatedAt 은 생성 시각과 같은 시점으로 채워진다', async () => {
      const sensor = await newSensor(await household())
      expect(Math.abs(sensor.updatedAt.getTime() - sensor.createdAt.getTime())).toBeLessThan(1000)
    })

    it('움직임 기록·알림·전달 기록·읽음을 만들고 조회하고 지운다', async () => {
      const householdId = await household()
      const guardian = await ctx.prisma.guardian.findFirstOrThrow({ where: { householdId } })
      const sensor = await newSensor(householdId)
      const event = await ctx.prisma.movementEvent.create({
        data: {
          householdId,
          sensorId: sensor.id,
          zone: 'PATH',
          origin: 'SIMULATED',
          deviceEventId: 'dev-1',
          occurredAt: new Date('2026-11-17T15:00:00Z'),
        },
      })
      const alert = await ctx.prisma.alert.create({
        data: {
          householdId,
          type: 'BED_TO_PATH',
          severity: 'NOTICE',
          origin: 'SIMULATED',
          title: '제목',
          message: '내용',
          dedupeKey: 'BED_TO_PATH',
          triggeredAt: event.occurredAt,
          sensorId: sensor.id,
          evidence: { create: { eventId: event.id } },
          deliveries: { create: { guardianId: guardian.id, channel: 'IN_APP' } },
          reads: { create: { guardianId: guardian.id } },
        },
        include: { evidence: true, deliveries: true, reads: true },
      })
      expect(alert.evidence).toHaveLength(1)
      expect(alert.deliveries[0]).toMatchObject({ status: 'PENDING', attempts: 0 })
      expect(alert.reads).toHaveLength(1)

      const updated = await ctx.prisma.alert.update({
        where: { id: alert.id },
        data: { status: 'RESOLVED', resolution: 'CHECKED', resolvedAt: new Date() },
      })
      expect(updated.status).toBe('RESOLVED')

      await ctx.prisma.alert.delete({ where: { id: alert.id } })
      expect(await ctx.prisma.notificationDelivery.count({ where: { alertId: alert.id } })).toBe(0)
      expect(await ctx.prisma.alertRead.count({ where: { alertId: alert.id } })).toBe(0)
      expect(await ctx.prisma.alertEvidence.count({ where: { alertId: alert.id } })).toBe(0)
      // 근거였던 움직임 기록은 알림을 지워도 남는다.
      expect(await ctx.prisma.movementEvent.count({ where: { id: event.id } })).toBe(1)
    })

    it('설정은 가구마다 하나이고, 기본값으로 만들어진다', async () => {
      const householdId = await household()
      const settings = await ctx.prisma.detectionSettings.create({ data: { householdId } })
      expect(settings).toMatchObject({ monitoringEnabled: true, activeWeekdays: 127 })
      await expect(ctx.prisma.detectionSettings.create({ data: { householdId } })).rejects.toThrow()
      const prefs = await ctx.prisma.alertPreferences.create({ data: { householdId } })
      expect(prefs).toMatchObject({ entranceApproach: true, lowBattery: true })
    })
  })

  describe('유일성·외래키·열거형', () => {
    it('장치 번호는 같은 가구 안에서만 중복될 수 없고, 비워 둔 센서끼리는 겹쳐도 된다', async () => {
      const a = await household()
      const b = await household()
      await newSensor(a, { deviceId: 'dev-001' })
      await expect(newSensor(a, { deviceId: 'dev-001' })).rejects.toThrow()
      await expect(newSensor(b, { deviceId: 'dev-001' })).resolves.toBeTruthy() // 다른 가구
      await newSensor(a)
      await expect(newSensor(a)).resolves.toBeTruthy() // 장치 번호 없음(NULL)끼리는 허용
    })

    it('센서 토큰 해시는 전체에서 유일하다', async () => {
      const householdId = await household()
      await newSensor(householdId, { tokenHash: 'same-hash' })
      await expect(newSensor(householdId, { tokenHash: 'same-hash' })).rejects.toThrow()
    })

    it('같은 센서의 같은 장치 이벤트 ID 는 두 번 저장되지 않는다 (재전송 방지)', async () => {
      const householdId = await household()
      const sensor = await newSensor(householdId)
      const data = {
        householdId,
        sensorId: sensor.id,
        zone: 'PATH' as const,
        origin: 'SIMULATED' as const,
        deviceEventId: 'dup',
        occurredAt: new Date(),
      }
      await ctx.prisma.movementEvent.create({ data })
      await expect(ctx.prisma.movementEvent.create({ data })).rejects.toThrow()
    })

    it('없는 가구를 가리키는 센서는 만들 수 없다 (외래키)', async () => {
      await expect(newSensor('no-such-household')).rejects.toThrow()
    })

    it('열거형이 아닌 값은 저장되지 않는다', async () => {
      const householdId = await household()
      await expect(newSensor(householdId, { zone: 'GARAGE' })).rejects.toThrow()
      await expect(newSensor(householdId, { sensitivity: 'EXTREME' })).rejects.toThrow()
    })
  })

  describe('삭제 시 연관 데이터 처리 정책', () => {
    it('센서를 지우면 그 센서의 움직임 기록·상태 이력이 함께 지워지고, 알림은 남되 센서 연결만 끊긴다', async () => {
      const householdId = await household()
      const sensor = await newSensor(householdId)
      await ctx.prisma.movementEvent.create({
        data: {
          householdId,
          sensorId: sensor.id,
          zone: 'PATH',
          origin: 'SIMULATED',
          deviceEventId: 'e1',
          occurredAt: new Date(),
        },
      })
      await ctx.prisma.sensorStatusLog.create({ data: { sensorId: sensor.id, kind: 'CONNECTED' } })
      const alert = await ctx.prisma.alert.create({
        data: {
          householdId,
          type: 'SENSOR_OFFLINE',
          severity: 'NOTICE',
          origin: 'SIMULATED',
          title: 't',
          message: 'm',
          dedupeKey: 'k',
          triggeredAt: new Date(),
          sensorId: sensor.id,
        },
      })

      await ctx.prisma.sensor.delete({ where: { id: sensor.id } })
      expect(await ctx.prisma.movementEvent.count({ where: { sensorId: sensor.id } })).toBe(0)
      expect(await ctx.prisma.sensorStatusLog.count({ where: { sensorId: sensor.id } })).toBe(0)
      const kept = await ctx.prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })
      expect(kept.sensorId).toBeNull()
    })

    it('보호자를 지우면 그 보호자의 세션·읽음·전달 기록이 지워지지만 알림 자체는 남는다', async () => {
      const householdId = await household()
      const guardian = await ctx.prisma.guardian.findFirstOrThrow({ where: { householdId } })
      const alert = await ctx.prisma.alert.create({
        data: {
          householdId,
          type: 'LOW_BATTERY',
          severity: 'INFO',
          origin: 'SIMULATED',
          title: 't',
          message: 'm',
          dedupeKey: 'k',
          triggeredAt: new Date(),
          reads: { create: { guardianId: guardian.id } },
          deliveries: { create: { guardianId: guardian.id, channel: 'IN_APP' } },
        },
      })
      await ctx.prisma.session.create({
        data: {
          id: `s-${Math.random()}`,
          guardianId: guardian.id,
          expiresAt: new Date(Date.now() + 1000),
        },
      })
      await ctx.prisma.guardian.delete({ where: { id: guardian.id } })
      expect(await ctx.prisma.session.count({ where: { guardianId: guardian.id } })).toBe(0)
      expect(await ctx.prisma.alertRead.count({ where: { guardianId: guardian.id } })).toBe(0)
      expect(
        await ctx.prisma.notificationDelivery.count({ where: { guardianId: guardian.id } }),
      ).toBe(0)
      expect(await ctx.prisma.alert.count({ where: { id: alert.id } })).toBe(1)
    })

    it('가구를 지우면 그 가구의 모든 데이터가 함께 지워진다 (다른 가구는 그대로)', async () => {
      const gone = await household()
      const kept = await household()
      const sensor = await newSensor(gone)
      await ctx.prisma.detectionSettings.create({ data: { householdId: gone } })
      await ctx.prisma.alertPreferences.create({ data: { householdId: gone } })
      await ctx.prisma.movementEvent.create({
        data: {
          householdId: gone,
          sensorId: sensor.id,
          zone: 'PATH',
          origin: 'SIMULATED',
          deviceEventId: 'e',
          occurredAt: new Date(),
        },
      })
      await ctx.prisma.household.delete({ where: { id: gone } })
      for (const model of [
        ctx.prisma.guardian,
        ctx.prisma.careRecipient,
        ctx.prisma.sensor,
        ctx.prisma.movementEvent,
        ctx.prisma.detectionSettings,
        ctx.prisma.alertPreferences,
      ] as const) {
        expect(
          await (model as { count(args: unknown): Promise<number> }).count({
            where: { householdId: gone },
          }),
        ).toBe(0)
      }
      expect(await ctx.prisma.guardian.count({ where: { householdId: kept } })).toBe(1)
    })
  })

  describe('조회용 인덱스', () => {
    it('자주 쓰는 조회 조건마다 인덱스가 있다', async () => {
      const rows = await ctx.prisma.$queryRawUnsafe<{ name: string }[]>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'",
      )
      const names = new Set(rows.map((r) => r.name))
      for (const expected of [
        'Guardian_email_key',
        'Guardian_householdId_idx',
        'Sensor_tokenHash_key',
        'Sensor_householdId_zone_idx',
        'Sensor_householdId_deviceId_key',
        'MovementEvent_householdId_occurredAt_idx',
        'MovementEvent_sensorId_occurredAt_idx',
        'MovementEvent_sensorId_deviceEventId_key',
        'Alert_householdId_status_triggeredAt_idx',
        'AlertRead_guardianId_idx',
        'NotificationDelivery_alertId_idx',
        'NotificationDelivery_guardianId_idx',
        'NotificationDelivery_status_nextAttemptAt_idx',
        'SensorStatusLog_sensorId_at_idx',
        'Session_expiresAt_idx',
      ]) {
        expect(names.has(expected), expected).toBe(true)
      }
    })

    it('외래키 검사를 통과한다 (끊어진 참조 없음)', async () => {
      const broken = await ctx.prisma.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check')
      expect(broken).toEqual([])
    })
  })
})
