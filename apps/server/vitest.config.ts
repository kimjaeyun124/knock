import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 시험마다 실제 비밀번호 해시(scrypt)·임시 DB·마이그레이션을 쓰므로, 기계가 바쁠 때 기본 5초는 부족하다.
    // (부하를 주고 돌렸을 때 센서 목록 시험이 시간 초과로 실패하는 것을 확인함. 논리 오류가 아니다)
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
