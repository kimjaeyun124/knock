import { chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { BackupStatus } from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import type { Logger } from '@/utils/logger'

/** 이 서비스가 만든 백업 파일 이름. 다른 파일은 절대 지우지 않기 위해 이 형식만 다룬다. */
const BACKUP_FILE = /^tetris-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/

export interface BackupServiceOptions {
  prisma: PrismaClient
  logger: Logger
  now: () => Date
  /** 백업을 쌓을 폴더(없으면 만든다). 백업에는 개인정보가 들어 있어 폴더는 소유자만 접근하게 만든다. */
  dir: string
  /** 최근 몇 개를 남길지 */
  keep: number
  /** 몇 시간마다 만들지 */
  intervalHours: number
}

export type BackupOutcome = 'CREATED' | 'SKIPPED_NOT_DUE' | 'FAILED'

function fileTime(name: string): Date | null {
  const m = BACKUP_FILE.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s))
}

function fileName(at: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `tetris-${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}` +
    `-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}.db`
  )
}

/**
 * SQLite 데이터베이스를 주기적으로 한 파일로 백업한다.
 *
 * - `VACUUM INTO` 로 만들어 서버가 쓰는 도중에도 일관된 복사본이 된다. (파일을 그냥 cp 하면 깨질 수 있다)
 * - 만든 직후 **다시 열어 무결성을 확인**하고, 통과한 것만 정식 이름으로 남긴다. 실패하면 이전 백업은 그대로 두고 오래된 것도 지우지 않는다.
 * - 실패를 숨기지 않는다. 로그에 남기고 상태(`status()`)로 화면에도 알린다. (경로 등 내부 정보는 화면에 내보내지 않는다)
 * - 서버가 자주 재시작되어도 백업이 쌓여 좋은 백업을 밀어내지 않도록, 마지막 백업이 간격 안에 있으면 만들지 않는다.
 */
export class BackupService {
  private lastSuccessAt: Date | null = null
  private lastFailureAt: Date | null = null
  private failed = false
  private backupCount = 0
  private initialised = false

  constructor(private readonly options: BackupServiceOptions) {}

  /** 지금 백업을 만들 때가 되었으면 만든다. 스케줄러가 자주 불러도 간격 안에서는 아무것도 하지 않는다. */
  async runIfDue(): Promise<BackupOutcome> {
    const existing = await this.listBackups()
    const latest = existing[0]
    if (latest && !this.initialised) this.lastSuccessAt = latest.at
    this.initialised = true
    this.backupCount = existing.length
    const intervalMs = this.options.intervalHours * 3_600_000
    if (latest && this.options.now().getTime() - latest.at.getTime() < intervalMs) {
      return 'SKIPPED_NOT_DUE'
    }
    return this.run()
  }

  /** 지금 바로 백업을 만든다. */
  async run(): Promise<BackupOutcome> {
    const { dir, logger } = this.options
    const at = this.options.now()
    const finalName = fileName(at)
    const finalPath = join(dir, finalName)
    const partialPath = `${finalPath}.partial`
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await rm(partialPath, { force: true })
      // 같은 초에 이미 있으면 덮어쓰지 않는다.
      if (await exists(finalPath)) return 'SKIPPED_NOT_DUE'
      await this.options.prisma.$executeRawUnsafe(
        `VACUUM INTO '${partialPath.replaceAll("'", "''")}'`,
      )
      await chmod(partialPath, 0o600)
      verify(partialPath)
      await rename(partialPath, finalPath)
      this.lastSuccessAt = at
      this.failed = false
      logger.info({ file: finalName }, '데이터베이스를 백업했습니다.')
      await this.prune()
      return 'CREATED'
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => undefined)
      this.lastFailureAt = at
      this.failed = true
      logger.error({ err: error }, '데이터베이스 백업에 실패했습니다.')
      return 'FAILED'
    }
  }

  /** 화면에 보여 줄 상태. 폴더 경로나 오류 상세는 담지 않는다. */
  status(): BackupStatus {
    return {
      enabled: true,
      intervalHours: this.options.intervalHours,
      keep: this.options.keep,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
      lastRunFailed: this.failed,
      backupCount: this.backupCount,
    }
  }

  private async listBackups(): Promise<{ name: string; at: Date }[]> {
    let names: string[]
    try {
      names = await readdir(this.options.dir)
    } catch {
      return []
    }
    return names
      .flatMap((name) => {
        const at = fileTime(name)
        return at ? [{ name, at }] : []
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime())
  }

  /** 최근 `keep` 개만 남기고 이 서비스가 만든 오래된 백업을 지운다. */
  private async prune(): Promise<void> {
    const all = await this.listBackups()
    this.backupCount = Math.min(all.length, this.options.keep)
    for (const old of all.slice(this.options.keep)) {
      try {
        await rm(join(this.options.dir, old.name))
      } catch (error) {
        this.backupCount += 1
        this.options.logger.warn({ err: error, file: old.name }, '오래된 백업을 지우지 못했습니다.')
      }
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** 백업 파일을 읽기 전용으로 다시 열어 손상되지 않았고 비어 있지 않은지 확인한다. */
function verify(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const check = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
    if (check.length !== 1 || check[0]?.integrity_check !== 'ok') {
      throw new Error('백업 파일의 무결성 검사에 실패했습니다.')
    }
    const tables = db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number }
    if (tables.n === 0) throw new Error('백업 파일에 테이블이 없습니다.')
  } finally {
    db.close()
  }
}
