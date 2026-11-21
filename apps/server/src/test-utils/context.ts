import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pino } from 'pino'
import { createApp } from '@/app'
import { loadEnv, type Env } from '@/config/env'
import { createServices, type Services } from '@/container'
import { createPrismaClient, type PrismaClient } from '@/db/client'
import { createRealtimeServer, type RealtimeServer } from '@/realtime/socket'
import { hashPassword } from '@/utils/password'
import { generateDeviceToken, hashToken } from '@/utils/tokens'
import { TestClient } from './http'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../prisma/migrations', import.meta.url))

/** 테스트용 시계. advance 로 시간을 앞으로 돌린다. */
export class TestClock {
  private current = Date.now()
  readonly now = (): Date => new Date(this.current)
  advance(ms: number): void {
    this.current += ms
  }
  /** 시계를 특정 시각으로 맞춘다. (야간 규칙을 시험하려면 한국 시각 밤으로 맞춘다) */
  set(date: Date): void {
    this.current = date.getTime()
  }
}

/** 실제 마이그레이션 SQL 을 그대로 적용한다. (운영과 같은 스키마로 테스트하기 위해) */
async function applyMigrations(prisma: PrismaClient): Promise<void> {
  const names = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of names) {
    const sql = await readFile(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
    for (const chunk of sql.split(/;\s*\n/)) {
      const statement = chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
      if (statement) await prisma.$executeRawUnsafe(statement)
    }
  }
}

export interface TestHousehold {
  householdId: string
  guardianId: string
  email: string
  password: string
}

export interface TestContext {
  prisma: PrismaClient
  services: Services
  env: Env
  clock: TestClock
  httpServer: Server
  io: RealtimeServer
  baseUrl: string
  createHousehold(options?: {
    email?: string
    password?: string
    name?: string
  }): Promise<TestHousehold>
  /** 보호자로 로그인한 테스트 클라이언트 */
  loginAs(user: TestHousehold): Promise<TestClient>
  /** 센서를 직접 만들고 장치 토큰을 돌려준다. (HTTP 를 거치지 않는 준비용) */
  createSensor(
    householdId: string,
    options?: {
      name?: string
      zone?: 'BED_SIDE' | 'PATH' | 'ENTRANCE'
      isActive?: boolean
      origin?: 'REAL' | 'SIMULATED'
    },
  ): Promise<{ id: string; token: string }>
  close(): Promise<void>
}

let householdCounter = 0

/**
 * 임시 SQLite 파일 + 실제 마이그레이션 + 실제 앱·실시간 서버를 띄운다.
 * 테스트 파일마다 하나씩 만들어 쓴다. (파일끼리 DB 를 공유하지 않는다)
 */
export async function createTestContext(
  options: {
    env?: Partial<Env>
    services?: Partial<Services>
    adapters?: Parameters<typeof createServices>[0]['adapters']
    /** 브라우저 푸시를 켠다. 실제 푸시 서비스 대신 pushSender 로 보낸 내용을 받는다. */
    push?: { sender: Parameters<typeof createServices>[0]['pushSender'] }
    /** 센서 시뮬레이터를 켠다. 기다리는 동작(sleep)은 바꿀 수 있고, 기본은 기다리지 않는다. */
    simulator?: boolean | { sleep?: (ms: number, signal: AbortSignal) => Promise<void> }
  } = {},
): Promise<TestContext> {
  const dir = await mkdtemp(join(tmpdir(), 'tetris-test-'))
  const env: Env = {
    ...loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      CLIENT_ORIGIN: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      DATABASE_URL: `file:${join(dir, 'test.db')}`,
    }),
    ...options.env,
  }

  const prisma = createPrismaClient(env.DATABASE_URL)
  await applyMigrations(prisma)

  const clock = new TestClock()
  const logger = pino({ level: 'silent' })
  const services: Services = {
    ...createServices({
      prisma,
      logger,
      now: clock.now,
      ...(options.adapters ? { adapters: options.adapters } : {}),
      ...(options.push
        ? {
            vapid: {
              publicKey: 'test-public-key',
              privateKey: 'test-private-key',
              subject: 'mailto:ops@example.com',
            },
            ...(options.push.sender ? { pushSender: options.push.sender } : {}),
          }
        : {}),
      ...(options.simulator
        ? {
            simulatorEnabled: true,
            simulatorSleep:
              (typeof options.simulator === 'object' ? options.simulator.sleep : undefined) ??
              (() => Promise.resolve()),
          }
        : {}),
    }),
    ...options.services,
  }

  const httpServer = createServer(createApp({ logger, env, services, now: clock.now }))
  const io = createRealtimeServer(httpServer, { env, logger, sessions: services.sessions })
  services.realtime.attach(io)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo
  services.simulator?.setIngestBaseUrl(`http://127.0.0.1:${port}`)

  return {
    prisma,
    services,
    env,
    clock,
    httpServer,
    io,
    baseUrl: `http://127.0.0.1:${port}`,

    async createHousehold(opts = {}) {
      householdCounter += 1
      const email = opts.email ?? `guardian${householdCounter}@example.com`
      const password = opts.password ?? `test-password-${householdCounter}`
      // 테스트 속도를 위해 낮은 비용으로 해시한다. (검증은 저장된 파라미터를 읽으므로 동일하게 동작)
      const passwordHash = await hashPassword(password, { N: 2 ** 10, r: 8, p: 1 })
      const household = await prisma.household.create({
        data: {
          name: opts.name ?? `테스트 가구 ${householdCounter}`,
          recipient: { create: { alias: '어르신(테스트)' } },
          guardians: { create: { email, displayName: '테스트 보호자', passwordHash } },
        },
        include: { guardians: true },
      })
      const guardian = household.guardians[0]
      if (!guardian) throw new Error('테스트 보호자를 만들지 못했습니다.')
      return { householdId: household.id, guardianId: guardian.id, email, password }
    },

    async loginAs(user) {
      const client = new TestClient(`http://127.0.0.1:${port}`)
      const res = await client.post('/api/auth/login', {
        email: user.email,
        password: user.password,
      })
      if (res.status !== 200) throw new Error(`테스트 로그인 실패: ${res.status}`)
      return client
    },

    async createSensor(householdId, opts = {}) {
      // 등록 개수 제한(API 규칙)과 무관하게 준비할 수 있도록 서비스를 거치지 않고 직접 만든다.
      const token = generateDeviceToken()
      const row = await prisma.sensor.create({
        data: {
          householdId,
          name: opts.name ?? '테스트 센서',
          zone: opts.zone ?? 'PATH',
          origin: opts.origin ?? 'REAL',
          isActive: opts.isActive ?? true,
          tokenHash: hashToken(token),
        },
      })
      return { id: row.id, token }
    },

    async close() {
      await io.close()
      httpServer.closeAllConnections()
      await prisma.$disconnect()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
