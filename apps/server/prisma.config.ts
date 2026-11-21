import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'
import { DEFAULT_DATABASE_URL } from './src/config/database'

// Prisma 7 은 .env 를 자동으로 읽지 않는다. 루트의 .env 가 있으면 읽는다.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL },
})
