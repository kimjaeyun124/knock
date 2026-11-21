import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { BackupService } from './backup.service'

const run = promisify(execFile)
const MIGRATIONS = fileURLToPath(new URL('../../prisma/migrations', import.meta.url))
const SCRIPT = fileURLToPath(new URL('../../scripts/verify-backup.mjs', import.meta.url))

async function verify(file?: string) {
  try {
    const { stdout } = await run(process.execPath, file ? [SCRIPT, file] : [SCRIPT])
    return { code: 0, out: stdout, err: '' }
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string }
    return { code: e.code, out: e.stdout, err: e.stderr }
  }
}

describe('백업 점검 스크립트 (npm run backup:verify)', () => {
  let ctx: TestContext
  let dir: string
  let good: string

  beforeAll(async () => {
    ctx = await createTestContext()
    dir = await mkdtemp(join(tmpdir(), 'tetris-verify-backup-'))
    await ctx.createHousehold({ email: 'verify@example.com' })
    const service = new BackupService({
      prisma: ctx.prisma,
      logger: pino({ level: 'silent' }),
      now: ctx.clock.now,
      dir,
      keep: 3,
      intervalHours: 24,
    })
    await service.run()
    good = join(dir, (await readdir(dir))[0] as string)
  })
  afterAll(async () => {
    await ctx.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('정상 백업이면 통과하고 테이블별 행 수를 보여 준다', async () => {
    const result = await verify(good)
    expect(result.code).toBe(0)
    expect(result.out).toContain('무결성 검사: 통과')
    expect(result.out).toMatch(/Guardian: 1/)
    expect(result.out).toContain('이 파일은 읽을 수 있고 손상되지 않았습니다')
    // 테스트 DB 는 마이그레이션 SQL 을 직접 적용해 기록 표가 없으므로 그 사실을 숨기지 않는다
    expect(result.out).toContain('버전을 비교할 수 없습니다')
  })

  it('경로를 주지 않거나 파일이 없으면 실패한다', async () => {
    expect((await verify()).code).toBe(1)
    const missing = await verify(join(dir, 'nope.db'))
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('파일이 없습니다')
  })

  it('SQLite 파일이 아니면 통과로 보고하지 않는다', async () => {
    const junk = join(dir, 'junk.db')
    await writeFile(junk, 'this is not a database '.repeat(50))
    const result = await verify(junk)
    expect(result.code).toBe(1)
    expect(result.out).not.toContain('이 파일은 읽을 수 있고')
  })

  it('파일 가운데가 망가진 백업은 무결성 검사에서 걸러진다', async () => {
    const { copyFile, open } = await import('node:fs/promises')
    const damaged = join(dir, 'damaged.db')
    await copyFile(good, damaged)
    const handle = await open(damaged, 'r+')
    try {
      // 두 번째 페이지 이후를 쓰레기로 덮는다
      await handle.write(Buffer.alloc(2048, 0xab), 0, 2048, 4096)
    } finally {
      await handle.close()
    }
    const result = await verify(damaged)
    expect(result.code).toBe(1)
    expect(result.out + result.err).not.toContain('이 파일은 읽을 수 있고')
  })

  it('스키마 버전을 비교한다: 오래된 백업은 안내, 코드보다 새로운 백업은 경고', async () => {
    const { copyFile } = await import('node:fs/promises')
    const { DatabaseSync } = await import('node:sqlite')
    const first = (await readdir(MIGRATIONS))
      .filter((n) => !n.endsWith('.toml'))
      .sort()[0] as string

    const old = join(dir, 'old-schema.db')
    await copyFile(good, old)
    const a = new DatabaseSync(old)
    a.exec('CREATE TABLE _prisma_migrations (migration_name TEXT, finished_at TEXT)')
    a.prepare('INSERT INTO _prisma_migrations VALUES (?, ?)').run(first, '2026-01-01')
    a.close()
    const olderResult = await verify(old)
    expect(olderResult.code).toBe(0)
    expect(olderResult.out).toMatch(/오래된 스키마입니다\(마이그레이션 \d+개 부족\)/)
    expect(olderResult.out).toContain('db:deploy')

    const future = join(dir, 'future-schema.db')
    await copyFile(good, future)
    const b = new DatabaseSync(future)
    b.exec('CREATE TABLE _prisma_migrations (migration_name TEXT, finished_at TEXT)')
    b.prepare('INSERT INTO _prisma_migrations VALUES (?, ?)').run(
      '29990101000000_future',
      '2999-01-01',
    )
    b.close()
    const newer = await verify(future)
    expect(newer.code).toBe(0)
    expect(newer.out).toContain('이 코드보다 새로운 마이그레이션')
    expect(newer.out).toContain('경고 확인 필요')
  })

  it('점검은 파일을 바꾸지 않는다 (읽기 전용)', async () => {
    const { readFile } = await import('node:fs/promises')
    const before = await readFile(good)
    await verify(good)
    expect((await readFile(good)).equals(before)).toBe(true)
  })
})
