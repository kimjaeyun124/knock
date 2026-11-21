// 서버 번들 빌드: src/main.ts → dist/main.js
//
// - tsconfig의 경로 별칭(@/...)과 워크스페이스 패키지(@tetris/shared, TS 소스)를 번들에 포함한다.
// - 외부 npm 의존성(express 등)은 번들하지 않고 node_modules에서 불러온다.
// - 타입 검사는 하지 않는다. 타입 검사는 `npm run typecheck`가 담당한다.

import { build } from 'esbuild'
import { readFile, rm } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@tetris/'))

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external,
  logLevel: 'info',
})
