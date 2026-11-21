import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE } from './support/credentials'
import { PREVIEW_ORIGIN, PREVIEW_PORT, SERVER_PORT, WEB_ORIGIN, WEB_PORT } from './support/env'

/**
 * E2E: 실제 서버(임시 SQLite)와 웹 개발 서버를 띄우고, 이미 설치된 Google Chrome 으로 전체 경로를 확인한다.
 * 브라우저를 따로 내려받지 않는다. (channel: 'chrome')
 *
 * 서버 상태(알림·센서·설정)를 모든 테스트가 공유하므로 한 번에 하나씩 실행한다. (workers: 1)
 * 느린 시나리오(연결 끊김 약 1.5분, 전달 실패 약 3분)는 실제 시간 기준을 그대로 기다린다.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: WEB_ORIGIN,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    storageState: STORAGE_STATE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/support/start-server.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${SERVER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web',
      cwd: '..',
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        WEB_PORT: String(WEB_PORT),
        SERVER_HOST: '127.0.0.1',
        SERVER_PORT: String(SERVER_PORT),
      },
    },
    {
      // 운영 빌드를 실제 보안 헤더(CSP)와 함께 서비스한다. (csp.spec.ts)
      command: 'npm run build -w @tetris/web && npm run preview -w @tetris/web',
      cwd: '..',
      url: PREVIEW_ORIGIN,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PREVIEW_PORT: String(PREVIEW_PORT),
        SERVER_HOST: '127.0.0.1',
        SERVER_PORT: String(SERVER_PORT),
        VITE_MOCK_FEATURES: '',
      },
    },
  ],
  projects: [
    {
      name: 'desktop',
      testMatch: [
        'flows.spec.ts',
        'a11y.spec.ts',
        'keyboard.spec.ts',
        'design.spec.ts',
        'layout.spec.ts',
        'dashboard.spec.ts',
        'sensors.spec.ts',
        'events.spec.ts',
        'notifications.spec.ts',
        'onboarding.spec.ts',
        'settings.spec.ts',
        'connection.spec.ts',
        'simulator.spec.ts',
        'realtime.spec.ts',
        'sensor-health.spec.ts',
        'demo.spec.ts',
        'viewports.spec.ts',
        'password.spec.ts',
        'webcam.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'prod-csp',
      testMatch: ['csp.spec.ts'],
      use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: PREVIEW_ORIGIN },
    },
    {
      name: 'tablet',
      testMatch: ['responsive.spec.ts', 'a11y.spec.ts', 'design.spec.ts', 'layout.spec.ts'],
      use: { ...devices['iPad Mini'], channel: 'chrome', browserName: 'chromium' },
    },
    {
      name: 'mobile',
      testMatch: [
        'responsive.spec.ts',
        'a11y.spec.ts',
        'design.spec.ts',
        'layout.spec.ts',
        'dashboard.spec.ts',
        'sensors.spec.ts',
        'events.spec.ts',
        'notifications.spec.ts',
        'onboarding.spec.ts',
        'settings.spec.ts',
      ],
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
  ],
})
