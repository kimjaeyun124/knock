import { createServer } from 'node:http'
import { createApp } from '@/app'
import { SERVICE_NAME, SERVICE_VERSION } from '@/config/app-info'
import { loadEnv } from '@/config/env'
import { createServices } from '@/container'
import { configureDatabase, createPrismaClient } from '@/db/client'
import { createRealtimeServer } from '@/realtime/socket'
import { MAINTENANCE_INTERVAL_MS } from '@/config/notifications'
import { createLogger } from '@/utils/logger'
import { LivenessPinger } from '@/services/liveness-pinger'
import { Scheduler } from '@/utils/scheduler'

const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000

async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)

  const prisma = createPrismaClient(env.DATABASE_URL)
  await configureDatabase(prisma)
  const services = createServices({
    prisma,
    logger,
    vapid: env.VAPID,
    simulatorEnabled: env.SIMULATOR_ENABLED,
    ...(env.BACKUP_DIR
      ? {
          backup: {
            dir: env.BACKUP_DIR,
            keep: env.BACKUP_KEEP,
            intervalHours: env.BACKUP_INTERVAL_HOURS,
          },
        }
      : {}),
    // 시뮬레이터는 서버 자신의 수집 API 를 실제 센서와 똑같이 HTTP 로 부른다.
    ingestBaseUrl: `http://127.0.0.1:${env.SERVER_PORT}`,
  })

  const app = createApp({ logger, env, services })
  const httpServer = createServer(app)
  const io = createRealtimeServer(httpServer, { env, logger, sessions: services.sessions })
  services.realtime.attach(io)

  // 주기 점검: 신호가 끊긴 센서 찾기, 알림 전달 재시도, 재알림, 오래된 기록 정리
  const maintenance = new Scheduler(
    '유지보수',
    () => services.maintenance.tick(),
    MAINTENANCE_INTERVAL_MS,
    logger,
  )

  // 외부 감시 신호: 서버가 멈추면 서버가 보내는 알림도 멈추므로, 신호가 끊기는 것을 외부 서비스가 알려 주게 한다.
  const MAX_TICK_AGE_MS = MAINTENANCE_INTERVAL_MS * 3
  const liveness = env.HEARTBEAT_PING_URL
    ? new Scheduler(
        '외부 감시 신호',
        async () => {
          await new LivenessPinger({
            url: env.HEARTBEAT_PING_URL as string,
            logger,
            check: async () => {
              await prisma.$queryRaw`SELECT 1`
              const last = services.maintenance.lastTickAt()
              // 연결 끊김을 찾아내는 주기 점검이 멈춰 있으면 건강하지 않은 것이다.
              if (!last || Date.now() - last.getTime() > MAX_TICK_AGE_MS) {
                throw new Error('주기 점검이 최근에 실행되지 않았습니다.')
              }
            },
          }).ping()
        },
        env.HEARTBEAT_PING_INTERVAL_SECONDS * 1000,
        logger,
      )
    : null

  // 자동 백업: 간격이 지났을 때만 만든다. 1시간마다 확인하므로 실패해도 다음 시간에 다시 시도한다.
  const backups = services.backup
    ? new Scheduler(
        '데이터베이스 백업',
        async () => {
          await services.backup?.runIfDue()
        },
        BACKUP_CHECK_INTERVAL_MS,
        logger,
      )
    : null

  // 만료된 로그인 세션을 주기적으로 정리한다.
  const purgeSessions = (): void => {
    services.sessions.purgeExpired().catch((error: unknown) => {
      logger.error({ err: error }, '만료된 세션 정리 실패')
    })
  }
  purgeSessions()
  void maintenance.runOnce()
  maintenance.start()
  services.simulator?.start()
  liveness?.start()
  if (backups) {
    void backups.runOnce()
    backups.start()
  }
  const purgeTimer = setInterval(purgeSessions, SESSION_PURGE_INTERVAL_MS)
  purgeTimer.unref()

  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal(
        `포트 ${env.SERVER_PORT}이(가) 이미 사용 중입니다. SERVER_PORT를 바꾸거나 실행 중인 서버를 종료해 주세요.`,
      )
    } else {
      logger.fatal({ err: error }, '서버를 시작하지 못했습니다.')
    }
    process.exit(1)
  })

  httpServer.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
    logger.info(
      { service: SERVICE_NAME, version: SERVICE_VERSION, env: env.NODE_ENV },
      `서버가 http://${env.SERVER_HOST}:${env.SERVER_PORT} 에서 실행 중입니다.`,
    )
  })

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, '서버를 종료합니다.')
    maintenance.stop()
    liveness?.stop()
    backups?.stop()
    services.simulator?.stop()
    // 연결이 정리되지 않아도 10초 뒤에는 강제 종료한다.
    const forceExit = setTimeout(() => process.exit(1), 10_000)
    forceExit.unref()
    void io
      .close()
      .then(() => {
        httpServer.closeAllConnections()
        return prisma.$disconnect()
      })
      .then(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, '처리되지 않은 Promise 거부')
    process.exit(1)
  })
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, '처리되지 않은 예외')
    process.exit(1)
  })
}

main().catch((error: unknown) => {
  // 로거가 만들어지기 전(환경변수 오류 등)의 실패는 표준 오류로 직접 출력한다.
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[서버 시작 실패] ${message}\n`)
  process.exit(1)
})
