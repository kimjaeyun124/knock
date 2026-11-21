import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { CONTENT_SECURITY_POLICY } from './csp'

// 시간 표시 테스트가 어디서 돌려도 같도록 시간대를 고정한다. (테스트가 쓰는 Node 프로세스에만 적용)
process.env.TZ = 'Asia/Seoul'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig(({ command, mode }) => {
  // 이 값들은 개발 서버 설정(프록시 대상, 포트)에만 쓰이며 클라이언트 번들에는 들어가지 않는다.
  // 번들에 노출되는 환경변수는 envPrefix(기본 VITE_)로 시작하는 것뿐이다.
  const serverEnv = loadEnv(mode, repoRoot, '')

  // Mock(샘플 데이터)은 개발 전용이다. 운영 빌드에 켜져 있으면 가짜 데이터가 실제처럼 보일 수 있으므로 빌드를 막는다.
  if (command === 'build' && (serverEnv.VITE_MOCK_FEATURES ?? '').trim() !== '') {
    throw new Error(
      '운영 빌드에서는 VITE_MOCK_FEATURES를 사용할 수 없습니다. 값을 비우고 다시 빌드해 주세요.',
    )
  }
  // 데모 모드(테스트 데이터)도 개발 전용이다.
  if (command === 'build' && (serverEnv.VITE_APP_MODE ?? '').trim().toLowerCase() === 'demo') {
    throw new Error(
      '운영 빌드에서는 VITE_APP_MODE=demo(데모 모드)를 사용할 수 없습니다. 값을 비우거나 api 로 바꾸고 다시 빌드해 주세요.',
    )
  }
  const serverHost = serverEnv.SERVER_HOST === '0.0.0.0' ? '127.0.0.1' : serverEnv.SERVER_HOST
  const apiTarget = `http://${serverHost || '127.0.0.1'}:${serverEnv.SERVER_PORT || '4000'}`

  // 개발 서버와 운영 빌드 미리보기가 같은 방식으로 API·실시간 연결을 서버로 넘긴다. (같은 출처 구조)
  const proxy = {
    '/api': { target: apiTarget },
    '/socket.io': { target: apiTarget, ws: true },
  }

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    resolve: { tsconfigPaths: true },
    build: {
      // 글꼴은 data: 주소로 끼워 넣지 않고 파일로 둔다. (CSP 의 font-src 'self' 는 data: 를 허용하지 않는다)
      assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    },
    server: {
      port: Number(serverEnv.WEB_PORT) || 5173,
      strictPort: true,
      // 개발 중에도 운영과 같은 "같은 출처" 구조를 유지한다. (쿠키·CORS 문제 방지)
      proxy,
    },
    // 운영 빌드를 로컬에서 확인하는 서버. 운영과 같은 보안 헤더(CSP)를 붙인다.
    preview: {
      port: Number(serverEnv.PREVIEW_PORT) || 4173,
      strictPort: true,
      proxy,
      headers: { 'Content-Security-Policy': CONTENT_SECURITY_POLICY },
    },
    test: {
      environment: 'jsdom',
      testTimeout: 15_000,
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
