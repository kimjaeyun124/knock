import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

describe('loadEnv', () => {
  it('값이 없으면 개발용 기본값을 쓴다', () => {
    const env = loadEnv({})
    expect(env.SERVER_PORT).toBe(4000)
    expect(env.SERVER_HOST).toBe('127.0.0.1')
    expect(env.CLIENT_ORIGIN).toBe('http://localhost:5173')
    expect(env.NODE_ENV).toBe('development')
  })

  it('문자열 포트를 숫자로 변환한다', () => {
    expect(loadEnv({ SERVER_PORT: '5050' }).SERVER_PORT).toBe(5050)
  })

  it('CLIENT_ORIGIN에서 경로를 제거하고 출처만 남긴다', () => {
    expect(loadEnv({ CLIENT_ORIGIN: 'http://localhost:5173/app/' }).CLIENT_ORIGIN).toBe(
      'http://localhost:5173',
    )
  })

  it('잘못된 포트는 한국어 안내와 함께 오류를 던진다', () => {
    expect(() => loadEnv({ SERVER_PORT: 'abc' })).toThrow('환경변수 설정이 올바르지 않습니다')
  })

  it('범위를 벗어난 포트를 거부한다', () => {
    expect(() => loadEnv({ SERVER_PORT: '70000' })).toThrow()
  })

  it('DATABASE_URL 기본값과 형식 검사', () => {
    expect(loadEnv({}).DATABASE_URL).toBe('file:./prisma/dev.db')
    expect(() => loadEnv({ DATABASE_URL: 'postgres://example' })).toThrow('SQLite 경로')
  })

  it('TRUST_PROXY 는 0~5 사이의 정수이고 기본은 0(프록시 없음)이다', () => {
    expect(loadEnv({}).TRUST_PROXY).toBe(0)
    expect(loadEnv({ TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1)
    expect(() => loadEnv({ TRUST_PROXY: '-1' })).toThrow()
    expect(() => loadEnv({ TRUST_PROXY: '6' })).toThrow()
    expect(() => loadEnv({ TRUST_PROXY: 'yes' })).toThrow()
  })

  it('API_RATE_LIMIT_PER_MINUTE 는 0(제한 없음) 이상의 정수이고 기본은 1200이다', () => {
    expect(loadEnv({}).API_RATE_LIMIT_PER_MINUTE).toBe(1200)
    expect(loadEnv({ API_RATE_LIMIT_PER_MINUTE: '0' }).API_RATE_LIMIT_PER_MINUTE).toBe(0)
    expect(() => loadEnv({ API_RATE_LIMIT_PER_MINUTE: '-5' })).toThrow()
    expect(() => loadEnv({ API_RATE_LIMIT_PER_MINUTE: 'many' })).toThrow()
  })

  it('VAPID 키는 모두 지정하거나 모두 비워야 한다', () => {
    expect(loadEnv({}).VAPID).toBeNull()
    expect(
      loadEnv({
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'mailto:ops@example.com',
      }).VAPID,
    ).toEqual({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@example.com' })
    expect(() => loadEnv({ VAPID_PUBLIC_KEY: 'pub' })).toThrow('모두 지정하거나 모두 비워야')
    expect(() =>
      loadEnv({
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'ops@example.com',
      }),
    ).toThrow('mailto:')
  })

  it('자동 백업은 BACKUP_DIR 을 지정해야 켜지고, 간격·보관 수는 범위를 지킨다', () => {
    const off = loadEnv({})
    expect(off.BACKUP_DIR).toBeUndefined()
    expect(off.BACKUP_INTERVAL_HOURS).toBe(24)
    expect(off.BACKUP_KEEP).toBe(7)
    expect(loadEnv({ BACKUP_DIR: '/var/backups/tetris' }).BACKUP_DIR).toBe('/var/backups/tetris')
    expect(() => loadEnv({ BACKUP_INTERVAL_HOURS: '0' })).toThrow()
    expect(() => loadEnv({ BACKUP_KEEP: '0' })).toThrow()
    expect(() => loadEnv({ BACKUP_DIR: '' })).toThrow()
  })

  it('SIMULATOR_ENABLED 는 지정하지 않으면 운영에서만 꺼진다', () => {
    expect(loadEnv({}).SIMULATOR_ENABLED).toBe(true)
    expect(loadEnv({ NODE_ENV: 'test' }).SIMULATOR_ENABLED).toBe(true)
    expect(loadEnv({ NODE_ENV: 'production' }).SIMULATOR_ENABLED).toBe(false)
    expect(loadEnv({ NODE_ENV: 'production', SIMULATOR_ENABLED: 'true' }).SIMULATOR_ENABLED).toBe(
      true,
    )
    expect(loadEnv({ SIMULATOR_ENABLED: 'false' }).SIMULATOR_ENABLED).toBe(false)
  })

  it('COOKIE_SECURE 는 지정하지 않으면 운영에서만 켜진다', () => {
    expect(loadEnv({}).COOKIE_SECURE).toBe(false)
    expect(loadEnv({ NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true)
    expect(loadEnv({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false)
    expect(loadEnv({ COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true)
  })
})
