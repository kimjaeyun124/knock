import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

export type { PrismaClient }

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) })
}

/**
 * 운영 DB 연결 설정.
 * WAL: 읽기와 쓰기가 서로를 막지 않게 한다. busy_timeout: 잠겨 있으면 바로 실패하지 않고 잠시 기다린다.
 */
export async function configureDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL')
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
}
