import { defineConfig } from 'vitest/config'

// React Native 를 쓰지 않는 순수 로직(src/lib)만 Node 에서 시험한다.
export default defineConfig({
  test: { include: ['src/lib/__tests__/**/*.test.ts'], environment: 'node' },
})
