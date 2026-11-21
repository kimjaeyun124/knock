// 백업 파일이 복구에 쓸 수 있는지 읽기 전용으로 점검한다. 파일을 바꾸지 않고, 서버를 멈출 필요도 없다.
//   npm run backup:verify -w @tetris/server -- /var/backups/tetris/tetris-20261118-030000.db
// 종료 코드: 0 = 쓸 수 있음(경고가 있을 수 있음), 1 = 쓸 수 없음
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')

function fail(message) {
  process.stderr.write(`[실패] ${message}\n`)
  process.exit(1)
}

const arg = process.argv[2]
if (!arg)
  fail('백업 파일 경로를 지정해 주세요. 예: npm run backup:verify -w @tetris/server -- <파일>')
// npm 은 워크스페이스 폴더에서 실행하므로, 명령을 친 폴더(INIT_CWD) 기준으로 상대 경로를 해석한다.
const file = resolve(process.env.INIT_CWD ?? process.cwd(), arg)
if (!existsSync(file) || !statSync(file).isFile()) fail(`파일이 없습니다: ${file}`)

let db
try {
  db = new DatabaseSync(file, { readOnly: true })
} catch (error) {
  fail(`SQLite 파일로 열 수 없습니다: ${error instanceof Error ? error.message : String(error)}`)
}

try {
  const check = db.prepare('PRAGMA integrity_check').all()
  if (check.length !== 1 || check[0].integrity_check !== 'ok') {
    fail(`무결성 검사에 실패했습니다: ${JSON.stringify(check.slice(0, 3))}`)
  }
  process.stdout.write('무결성 검사: 통과\n')

  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
  if (tables.length === 0) fail('테이블이 하나도 없습니다.')
  process.stdout.write('\n테이블별 행 수\n')
  for (const name of tables) {
    const { n } = db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`).get()
    process.stdout.write(`  ${name}: ${n}\n`)
  }

  // 이 코드가 기대하는 마이그레이션과 백업에 적용된 마이그레이션을 비교한다.
  const expected = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  let applied = null
  if (tables.includes('_prisma_migrations')) {
    applied = db
      .prepare('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')
      .all()
      .map((row) => row.migration_name)
  }

  process.stdout.write('\n스키마 버전\n')
  let warned = false
  if (applied === null) {
    // 테스트·개발용으로 마이그레이션 SQL 을 직접 적용한 DB 에는 기록 표가 없을 수 있다.
    process.stdout.write(
      '  [경고] 마이그레이션 기록(_prisma_migrations)이 없어 버전을 비교할 수 없습니다.\n',
    )
    warned = true
  } else {
    const missing = expected.filter((name) => !applied.includes(name))
    const unknown = applied.filter((name) => !expected.includes(name))
    if (unknown.length > 0) {
      process.stdout.write(
        `  [경고] 이 코드보다 새로운 마이그레이션이 적용된 백업입니다(${unknown.length}개). 이 코드로 복구하면 안 됩니다. 코드를 맞춰 주세요.\n`,
      )
      warned = true
    }
    if (missing.length > 0) {
      process.stdout.write(
        `  [안내] 백업이 현재 코드보다 오래된 스키마입니다(마이그레이션 ${missing.length}개 부족). 복구한 뒤 \`npm run db:deploy\` 를 실행하면 맞춰집니다.\n`,
      )
    }
    if (unknown.length === 0 && missing.length === 0) {
      process.stdout.write(`  현재 코드와 같은 스키마입니다(마이그레이션 ${expected.length}개).\n`)
    }
  }

  process.stdout.write(
    `\n결과: 이 파일은 읽을 수 있고 손상되지 않았습니다${warned ? ' (경고 확인 필요)' : ''}.\n` +
      '이 점검은 파일 상태만 확인합니다. 실제 복구(서버를 멈추고 DATABASE_URL 위치로 복사 → 시작)는 직접 한 번 해 보세요.\n',
  )
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  db.close()
}
