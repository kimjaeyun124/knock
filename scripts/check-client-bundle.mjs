// 빌드 후 검사: 웹 번들(apps/web/dist)에 서버 전용 비밀값이 섞이지 않았는지 확인한다.
//
// 1) .env.example 에서 VITE_ 접두사가 붙은 키 이름이 비밀값처럼 보이면 실패
//    (VITE_ 값은 브라우저에 그대로 공개되므로)
// 2) 서버 전용 비밀 키 이름과, 로컬 .env 에 실제로 설정된 그 값이 번들에 있으면 실패
//
// 3) 개발 전용 Mock 어댑터의 표식이 번들에 있으면 실패 (샘플 데이터가 운영에 섞이지 않게)
//
// 방어는 3겹이다: Vite의 VITE_ 접두사 규칙 → ESLint(web/shared의 process 사용 금지) → 이 검사.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(root, 'apps/web/dist')
const MOCK_SENTINEL = '__TETRIS_MOCK_ADAPTER__'
const SECRET_KEY_PATTERN = /(SECRET|PRIVATE|TOKEN|PASSWORD|API_KEY|DATABASE_URL)/i

function parseEnvKeys(file) {
  if (!existsSync(file)) return new Map()
  const entries = new Map()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match) entries.set(match[1], match[2].replace(/^['"]|['"]$/g, '').trim())
  }
  return entries
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else yield path
  }
}

const problems = []
const example = parseEnvKeys(join(root, '.env.example'))
const local = parseEnvKeys(join(root, '.env'))

for (const key of example.keys()) {
  if (key.startsWith('VITE_') && SECRET_KEY_PATTERN.test(key)) {
    problems.push(
      `.env.example: ${key} — VITE_ 변수는 브라우저에 공개됩니다. 비밀값에는 VITE_ 를 쓰지 마세요.`,
    )
  }
}

if (!existsSync(distDir)) {
  problems.push('apps/web/dist 가 없습니다. 웹 빌드가 먼저 실행되어야 합니다.')
} else {
  const needles = []
  for (const key of new Set([...example.keys(), ...local.keys()])) {
    if (key.startsWith('VITE_') || !SECRET_KEY_PATTERN.test(key)) continue
    needles.push({ label: `${key} (이름)`, text: key })
    const localValue = local.get(key)
    if (localValue && localValue.length >= 8) {
      needles.push({ label: `${key} (값)`, text: localValue })
    }
  }
  for (const file of walk(distDir)) {
    if (!/\.(js|mjs|css|html|map|json)$/.test(file)) continue
    const content = readFileSync(file, 'utf8')
    for (const { label, text } of needles) {
      if (content.includes(text)) {
        problems.push(`${file.replace(root, '')}: ${label} 이(가) 웹 번들에 포함되어 있습니다.`)
      }
    }
    if (content.includes(MOCK_SENTINEL)) {
      problems.push(
        `${file.replace(root, '')}: 개발 전용 Mock 어댑터가 웹 번들에 포함되어 있습니다.`,
      )
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(
    `\n[check-client-bundle] 실패\n${problems.map((p) => `  - ${p}`).join('\n')}\n`,
  )
  process.exit(1)
}
process.stdout.write('[check-client-bundle] 웹 번들에 서버 전용 비밀값과 Mock 어댑터가 없습니다.\n')
