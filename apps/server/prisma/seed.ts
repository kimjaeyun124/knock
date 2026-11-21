/**
 * 개발·시연용 가상 데이터. 실제 개인정보를 넣지 않는다.
 * 여러 번 실행해도 같은 결과가 되도록 만들었다. (이미 있으면 비밀번호만 갱신)
 *
 *   npm run db:seed
 *
 * 비밀번호는 환경변수 SEED_DEMO_PASSWORD 로 받는다. (.env.example 참고)
 * 운영 환경(NODE_ENV=production)에서는 실행을 거부한다.
 */
import { z } from 'zod'
import { loadEnv } from '@/config/env'
import { createPrismaClient } from '@/db/client'
import { hashPassword } from '@/utils/password'
import { generateDeviceToken, hashToken } from '@/utils/tokens'
import type { PrismaClient } from '@/db/client'

const DEMO_GUARDIAN_EMAIL = 'demo@example.com'

/**
 * 샘플 센서 3개(침대 주변·이동 경로·현관)와 최근 사흘 밤의 움직임 기록. 모두 시뮬레이션(SIMULATED)이라
 * 화면에 "시뮬레이션"으로 표시되고, 실제 인물·장치와 무관한 값이다. 센서가 이미 있으면 아무것도 하지 않는다.
 * (장치 토큰은 만들자마자 버린다 — 이 센서들로 실제 신호를 보내는 용도가 아니다.)
 */
async function ensureSampleData(prisma: PrismaClient, householdId: string): Promise<boolean> {
  if ((await prisma.sensor.count({ where: { householdId } })) > 0) return false
  const specs = [
    { zone: 'BED_SIDE', name: '침대 옆(샘플)', deviceId: 'demo-bed-01' },
    { zone: 'PATH', name: '복도(샘플)', deviceId: 'demo-path-01' },
    { zone: 'ENTRANCE', name: '현관문(샘플)', deviceId: 'demo-door-01' },
  ] as const
  const now = Date.now()
  for (const spec of specs) {
    const sensor = await prisma.sensor.create({
      data: {
        householdId,
        name: spec.name,
        zone: spec.zone,
        deviceId: spec.deviceId,
        origin: 'SIMULATED',
        tokenHash: hashToken(generateDeviceToken()),
        lastSeenAt: new Date(now),
        batteryPercent: 90,
      },
    })
    // 사흘 동안, 밤 11시·새벽 2시·새벽 4시쯤 한 번씩
    for (const [dayAgo, hour] of [
      [1, 23],
      [1, 2],
      [2, 4],
    ] as const) {
      const occurredAt = new Date(
        now - dayAgo * 24 * 3600_000 - ((new Date(now).getHours() - hour + 24) % 24) * 3600_000,
      )
      await prisma.movementEvent.create({
        data: {
          householdId,
          sensorId: sensor.id,
          zone: spec.zone,
          origin: 'SIMULATED',
          deviceEventId: `seed-${spec.deviceId}-${dayAgo}-${hour}`,
          occurredAt,
        },
      })
    }
  }
  return true
}

async function seed(): Promise<void> {
  const env = loadEnv()
  if (env.NODE_ENV === 'production') {
    throw new Error('운영 환경에서는 시드 데이터를 만들 수 없습니다.')
  }

  const parsed = z
    .object({ SEED_DEMO_PASSWORD: z.string().min(12, '12자 이상이어야 합니다.') })
    .safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `SEED_DEMO_PASSWORD 환경변수가 필요합니다. .env.example 을 .env 로 복사했는지 확인해 주세요.\n${z.prettifyError(parsed.error)}`,
    )
  }
  const passwordHash = await hashPassword(parsed.data.SEED_DEMO_PASSWORD)

  const prisma = createPrismaClient(env.DATABASE_URL)
  try {
    const existing = await prisma.guardian.findUnique({ where: { email: DEMO_GUARDIAN_EMAIL } })
    if (existing) {
      await prisma.guardian.update({ where: { id: existing.id }, data: { passwordHash } })
      const added = await ensureSampleData(prisma, existing.householdId)
      process.stdout.write(
        `[seed] 데모 보호자(${DEMO_GUARDIAN_EMAIL})가 이미 있어 비밀번호만 갱신했습니다.${added ? ' 샘플 센서·움직임 기록을 채웠습니다.' : ''}\n`,
      )
      return
    }

    const household = await prisma.household.create({
      data: {
        name: '데모 가구',
        recipient: { create: { alias: '어르신(데모)' } },
        settings: { create: {} },
        guardians: {
          create: { email: DEMO_GUARDIAN_EMAIL, displayName: '데모 보호자', passwordHash },
        },
      },
    })
    await ensureSampleData(prisma, household.id)
    process.stdout.write(
      `[seed] 데모 가구, 보호자(${DEMO_GUARDIAN_EMAIL}), 샘플 센서·움직임 기록을 만들었습니다.\n`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[seed 실패] ${message}\n`)
  process.exit(1)
})
