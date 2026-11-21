// E2E 용 서버 기동: 매번 새 SQLite 파일(apps/server/prisma/e2e.db)을 만들고 마이그레이션한 뒤 서버를 띄운다.
// 개발용 DB(dev.db)와 .env 는 건드리지 않는다. (Playwright 의 webServer 가 이 스크립트를 실행한다)
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const serverDir = fileURLToPath(new URL('../../apps/server/', import.meta.url))
const env = {
  ...process.env,
  NODE_ENV: 'development',
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: '4100',
  CLIENT_ORIGIN: 'http://localhost:5273',
  DATABASE_URL: 'file:./prisma/e2e.db',
  COOKIE_SECURE: 'false',
  LOG_LEVEL: 'warn',
  SIMULATOR_ENABLED: 'true',
  // 테스트 하나가 분당 수백 건을 한 IP 에서 보내므로 요청 제한은 넉넉히 둔다. (제한 동작은 서버 테스트가 확인)
  API_RATE_LIMIT_PER_MINUTE: '60000',
}
// 개발자의 .env 에 푸시 키가 있어도 E2E 는 푸시 없이 돌린다.
for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) delete env[key]

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  rmSync(`${serverDir}prisma/e2e.db${suffix}`, { force: true })
}

const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: serverDir,
  env,
  stdio: 'inherit',
})
if (migrate.status !== 0) process.exit(migrate.status ?? 1)

const server = spawn('npx', ['tsx', 'src/main.ts'], { cwd: serverDir, env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}
server.on('exit', (code) => process.exit(code ?? 0))
