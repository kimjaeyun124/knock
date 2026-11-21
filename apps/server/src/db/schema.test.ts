import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALERT_TYPES,
  CHANNELS,
  DATA_ORIGINS,
  DEFAULT_DETECTION_SETTINGS,
  DELIVERY_STATUSES,
  GUARDIAN_ROLES,
  MOVEMENT_CLASSES,
  maskToWeekdays,
  PROVIDER_MODES,
  RESOLUTIONS,
  SENSITIVITIES,
  SENSOR_KINDS,
  SENSOR_STATUS_LOG_KINDS,
  ZONE_KINDS,
} from '@tetris/shared'
import * as PrismaEnums from '@/generated/prisma/enums'
import { createTestContext, type TestContext } from '@/test-utils/context'

describe('DB 스키마와 공유 계약', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('Prisma enum 값이 packages/shared 의 상수와 일치한다', () => {
    const pairs: Array<[string, Record<string, string>, readonly string[]]> = [
      ['GuardianRole', PrismaEnums.GuardianRole, GUARDIAN_ROLES],
      ['ZoneKind', PrismaEnums.ZoneKind, ZONE_KINDS],
      ['SensorKind', PrismaEnums.SensorKind, SENSOR_KINDS],
      ['DataOrigin', PrismaEnums.DataOrigin, DATA_ORIGINS],
      ['Sensitivity', PrismaEnums.Sensitivity, SENSITIVITIES],
      ['SensorStatusLogKind', PrismaEnums.SensorStatusLogKind, SENSOR_STATUS_LOG_KINDS],
      ['AlertType', PrismaEnums.AlertType, ALERT_TYPES],
      ['AlertSeverity', PrismaEnums.AlertSeverity, ALERT_SEVERITIES],
      ['AlertStatus', PrismaEnums.AlertStatus, ALERT_STATUSES],
      ['Resolution', PrismaEnums.Resolution, RESOLUTIONS],
      ['Channel', PrismaEnums.Channel, CHANNELS],
      ['DeliveryStatus', PrismaEnums.DeliveryStatus, DELIVERY_STATUSES],
      ['ProviderMode', PrismaEnums.ProviderMode, PROVIDER_MODES],
      ['MovementClass', PrismaEnums.MovementClass, MOVEMENT_CLASSES],
    ]
    for (const [name, prismaEnum, shared] of pairs) {
      expect(Object.values(prismaEnum).sort(), name).toEqual([...shared].sort())
    }
  })

  it('DB 기본 설정값이 공유 상수 DEFAULT_DETECTION_SETTINGS 와 같다', async () => {
    const { householdId } = await ctx.createHousehold()
    const row = await ctx.prisma.detectionSettings.create({ data: { householdId } })
    const { householdId: _id, updatedAt: _at, activeWeekdays, ...defaults } = row
    expect({ ...defaults, activeWeekdays: maskToWeekdays(activeWeekdays) }).toEqual(
      DEFAULT_DETECTION_SETTINGS,
    )
  })

  it('이메일은 중복될 수 없다', async () => {
    const first = await ctx.createHousehold({ email: 'dup@example.com' })
    await expect(
      ctx.prisma.guardian.create({
        data: {
          householdId: first.householdId,
          email: 'dup@example.com',
          displayName: '중복',
          passwordHash: 'x',
        },
      }),
    ).rejects.toThrow()
  })

  it('가구를 지우면 보호자·세션·설정·센서·이벤트·알림이 함께 지워진다', async () => {
    const { householdId, guardianId } = await ctx.createHousehold()
    await ctx.prisma.detectionSettings.create({ data: { householdId } })
    await ctx.prisma.session.create({
      data: { id: 'session-hash-1', guardianId, expiresAt: new Date(Date.now() + 60_000) },
    })
    const sensor = await ctx.prisma.sensor.create({
      data: {
        householdId,
        name: '테스트 센서',
        zone: 'ENTRANCE',
        origin: 'SIMULATED',
        tokenHash: 'token-hash-1',
      },
    })
    const event = await ctx.prisma.movementEvent.create({
      data: {
        householdId,
        sensorId: sensor.id,
        zone: 'ENTRANCE',
        origin: 'SIMULATED',
        deviceEventId: 'evt-1',
        occurredAt: new Date(),
      },
    })
    const alert = await ctx.prisma.alert.create({
      data: {
        householdId,
        type: 'ENTRANCE_APPROACH',
        severity: 'URGENT',
        origin: 'SIMULATED',
        title: '현관 근처에서 움직임이 감지되었습니다.',
        message: '확인해 주세요.',
        sensorId: sensor.id,
        triggeredAt: new Date(),
        dedupeKey: 'ENTRANCE_APPROACH:ENTRANCE',
      },
    })
    await ctx.prisma.alertEvidence.create({ data: { alertId: alert.id, eventId: event.id } })
    await ctx.prisma.notificationDelivery.create({
      data: { alertId: alert.id, guardianId, channel: 'IN_APP', providerMode: 'REAL' },
    })

    await ctx.prisma.household.delete({ where: { id: householdId } })

    expect(await ctx.prisma.guardian.count({ where: { id: guardianId } })).toBe(0)
    expect(await ctx.prisma.session.count({ where: { guardianId } })).toBe(0)
    expect(await ctx.prisma.detectionSettings.count({ where: { householdId } })).toBe(0)
    expect(await ctx.prisma.sensor.count({ where: { householdId } })).toBe(0)
    expect(await ctx.prisma.movementEvent.count({ where: { householdId } })).toBe(0)
    expect(await ctx.prisma.alert.count({ where: { householdId } })).toBe(0)
    expect(await ctx.prisma.notificationDelivery.count({ where: { alertId: alert.id } })).toBe(0)
  })

  it('같은 센서의 같은 장치 이벤트 ID 는 중복 저장할 수 없다 (중복 전송 방지)', async () => {
    const { householdId } = await ctx.createHousehold()
    const sensor = await ctx.prisma.sensor.create({
      data: {
        householdId,
        name: '센서',
        zone: 'PATH',
        origin: 'REAL',
        tokenHash: 'token-hash-dup',
      },
    })
    const data = {
      householdId,
      sensorId: sensor.id,
      zone: 'PATH' as const,
      origin: 'REAL' as const,
      deviceEventId: 'same-id',
      occurredAt: new Date(),
    }
    await ctx.prisma.movementEvent.create({ data })
    await expect(ctx.prisma.movementEvent.create({ data })).rejects.toThrow()
  })
})
