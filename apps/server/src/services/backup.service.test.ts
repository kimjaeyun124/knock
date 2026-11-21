import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackupStatusSchema } from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'
import { BackupService } from './backup.service'

const HOUR = 3_600_000
const logger = pino({ level: 'silent' })

describe('자동 데이터베이스 백업', () => {
  let ctx: TestContext
  let root: string
  let seq = 0

  beforeAll(async () => {
    ctx = await createTestContext()
    root = await mkdtemp(join(tmpdir(), 'tetris-backup-test-'))
  })
  afterAll(async () => {
    await ctx.close()
    await rm(root, { recursive: true, force: true })
  })

  const newDir = (): string => join(root, `d${(seq += 1)}`)
  const make = (dir: string, keep = 7, intervalHours = 24) =>
    new BackupService({
      prisma: ctx.prisma,
      logger,
      now: ctx.clock.now,
      dir,
      keep,
      intervalHours,
    })
  const files = async (dir: string): Promise<string[]> => (await readdir(dir)).sort()

  it('백업을 만들고, 그 파일을 다시 열면 백업 시점의 데이터가 그대로 들어 있다 (복구 가능)', async () => {
    const user = await ctx.createHousehold({ email: 'backup-me@example.com' })
    const dir = newDir()
    expect(await make(dir).run()).toBe('CREATED')
    const [name] = await files(dir)
    expect(name).toMatch(/^tetris-\d{8}-\d{6}\.db$/)

    // 백업 뒤에 생긴 데이터는 백업에 없다 (백업은 그 시점의 사본이다)
    await ctx.createHousehold({ email: 'after-backup@example.com' })

    const db = new DatabaseSync(join(dir, name as string), { readOnly: true })
    try {
      const emails = (db.prepare('SELECT email FROM Guardian').all() as { email: string }[]).map(
        (row) => row.email,
      )
      expect(emails).toContain(user.email)
      expect(emails).not.toContain('after-backup@example.com')
    } finally {
      db.close()
    }
  })

  it('백업 파일은 소유자만 읽을 수 있다 (개인정보 포함)', async () => {
    const dir = newDir()
    await make(dir).run()
    const [name] = await files(dir)
    expect((await stat(join(dir, name as string))).mode & 0o777).toBe(0o600)
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
  })

  it('경로에 작은따옴표가 있어도 SQL 이 깨지지 않는다', async () => {
    const dir = join(root, "it's a dir")
    expect(await make(dir).run()).toBe('CREATED')
    expect(await files(dir)).toHaveLength(1)
  })

  it('간격 안에서는 새로 만들지 않고, 간격이 지나면 만든다', async () => {
    const dir = newDir()
    const service = make(dir, 7, 24)
    expect(await service.runIfDue()).toBe('CREATED')
    ctx.clock.advance(23 * HOUR)
    expect(await service.runIfDue()).toBe('SKIPPED_NOT_DUE')
    ctx.clock.advance(2 * HOUR)
    expect(await service.runIfDue()).toBe('CREATED')
    expect(await files(dir)).toHaveLength(2)
  })

  it('서버가 다시 시작되어도(새 인스턴스) 기존 백업을 알아보고, 시작할 때마다 새로 만들어 좋은 백업을 밀어내지 않는다', async () => {
    const dir = newDir()
    await make(dir, 3, 24).run()
    for (let i = 0; i < 5; i += 1) {
      ctx.clock.advance(HOUR)
      const restarted = make(dir, 3, 24)
      expect(await restarted.runIfDue()).toBe('SKIPPED_NOT_DUE')
      expect(restarted.status().lastSuccessAt).not.toBeNull()
      expect(restarted.status().backupCount).toBe(1)
    }
    expect(await files(dir)).toHaveLength(1)
  })

  it('최근 keep 개만 남기고 오래된 것을 지우되, 이 서비스가 만들지 않은 파일은 건드리지 않는다', async () => {
    const dir = newDir()
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'notes.txt'), '직접 둔 메모')
    await writeFile(join(dir, 'tetris-manual.db'), '직접 만든 백업')
    const service = make(dir, 3, 1)
    for (let i = 0; i < 6; i += 1) {
      ctx.clock.advance(2 * HOUR)
      expect(await service.runIfDue()).toBe('CREATED')
    }
    const names = await files(dir)
    expect(names.filter((n) => /^tetris-\d{8}-\d{6}\.db$/.test(n))).toHaveLength(3)
    expect(names).toContain('notes.txt')
    expect(names).toContain('tetris-manual.db')
    expect(service.status().backupCount).toBe(3)
  })

  it('실패하면 숨기지 않고 알리며, 이전 백업과 임시 파일 상태를 해치지 않고, 성공하면 실패 표시가 풀린다', async () => {
    const dir = newDir()
    const service = make(dir, 1, 1)
    expect(await service.run()).toBe('CREATED')
    const before = await files(dir)

    // 폴더 자리에 일반 파일이 있어 만들 수 없는 상황을 만든다
    const blocked = join(root, 'blocked')
    await writeFile(blocked, 'x')
    const broken = make(join(blocked, 'sub'), 1, 1)
    expect(await broken.run()).toBe('FAILED')
    const failed = broken.status()
    expect(failed.lastRunFailed).toBe(true)
    expect(failed.lastFailureAt).not.toBeNull()
    expect(failed.lastSuccessAt).toBeNull()
    expect(JSON.stringify(failed)).not.toContain(root) // 경로를 내보내지 않는다

    // 정상 폴더의 백업은 그대로, 실패한 시도는 지우기를 하지 않는다
    expect(await files(dir)).toEqual(before)

    ctx.clock.advance(2 * HOUR)
    expect(await service.run()).toBe('CREATED')
    expect(service.status().lastRunFailed).toBe(false)
    expect((await files(dir)).some((n) => n.endsWith('.partial'))).toBe(false)
  })

  it('상태는 스키마를 지키고 폴더 경로를 담지 않는다', async () => {
    const dir = newDir()
    const service = make(dir, 5, 12)
    await service.runIfDue()
    const status = BackupStatusSchema.parse(service.status())
    expect(status).toMatchObject({ enabled: true, intervalHours: 12, keep: 5, backupCount: 1 })
    expect(JSON.stringify(status)).not.toContain(dir)
  })
})

describe('GET /api/system/backup', () => {
  let ctx: TestContext
  let dir: string
  beforeAll(async () => {
    ctx = await createTestContext()
    dir = await mkdtemp(join(tmpdir(), 'tetris-backup-route-'))
  })
  afterAll(async () => {
    await ctx.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('로그인하지 않으면 401 이다', async () => {
    expect((await new TestClient(ctx.baseUrl).get('/api/system/backup')).status).toBe(401)
  })

  it('백업을 설정하지 않았으면 enabled:false 로 알린다 (백업이 있는 것처럼 보이지 않는다)', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const body = BackupStatusSchema.parse(await (await client.get('/api/system/backup')).json())
    expect(body).toMatchObject({ enabled: false, lastSuccessAt: null, backupCount: 0 })
  })

  it('설정했으면 마지막 성공 시각과 개수를 알린다', async () => {
    ctx.services.backup = new BackupService({
      prisma: ctx.prisma,
      logger,
      now: ctx.clock.now,
      dir,
      keep: 7,
      intervalHours: 24,
    })
    await ctx.services.backup.runIfDue()
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.get('/api/system/backup')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = BackupStatusSchema.parse(await res.json())
    expect(body).toMatchObject({ enabled: true, backupCount: 1, lastRunFailed: false })
    expect(body.lastSuccessAt).not.toBeNull()
  })
})
