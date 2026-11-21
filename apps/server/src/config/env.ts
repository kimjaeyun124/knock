import { z } from 'zod'
import { DEFAULT_DATABASE_URL } from './database'

/**
 * 서버 환경변수 스키마. 시작 시 한 번 검증하고, 잘못되면 서버를 띄우지 않는다.
 * 값은 `node --env-file-if-exists=../../.env` 로 루트의 .env 에서 읽는다.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVER_HOST: z.string().min(1).default('127.0.0.1'),
    SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CLIENT_ORIGIN: z
      .url()
      .default('http://localhost:5173')
      .transform((value) => new URL(value).origin),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .startsWith('file:', 'SQLite 경로여야 합니다. 예: file:./prisma/dev.db')
      .default(DEFAULT_DATABASE_URL),
    /** 세션 쿠키에 Secure 속성을 붙일지. 지정하지 않으면 운영(production)에서만 켠다. */
    COOKIE_SECURE: z.stringbool().optional(),
    /**
     * 앞단에 리버스 프록시(Caddy, nginx 등)가 몇 단계 있는지. 0 이면 프록시가 없다고 보고
     * 접속자 IP 를 연결에서 직접 읽는다. 프록시 뒤라면 그 단계 수를 지정해야 로그인 시도 제한이
     * 접속자별로 동작한다. (잘못 크게 지정하면 접속자가 IP 를 속일 수 있으므로 실제 단계 수만 쓴다)
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    /** 접속자(IP) 한 곳이 1분에 보낼 수 있는 사용자용 API 요청 수. 0 이면 제한하지 않는다. */
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).max(100_000).default(1200),
    /**
     * 외부 감시(데드맨 스위치) 주소. 지정하면 서버가 건강할 때 이 주소로 GET 신호를 주기적으로 보내,
     * 서버가 멈췄을 때 외부 서비스가 알려 줄 수 있게 한다. https 만 받는다. (값에 비밀 토큰이 들어 있을 수 있음)
     */
    HEARTBEAT_PING_URL: z
      .url()
      .refine((value) => value.startsWith('https://'), 'https:// 로 시작해야 합니다.')
      .optional(),
    /** 외부 감시 신호 간격(초) */
    HEARTBEAT_PING_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
    /**
     * 자동 백업 폴더. 지정하면 서버가 이 폴더에 데이터베이스를 주기적으로 백업한다. (기본은 꺼짐)
     * 백업에는 개인정보가 들어 있으므로 서버 디스크와 다른 곳(외장·다른 기기)에 두는 것을 권장한다.
     */
    BACKUP_DIR: z.string().min(1).optional(),
    /** 자동 백업 간격(시간) */
    BACKUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    /** 남겨 둘 백업 수. 이보다 오래된 것은 지운다. */
    BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(7),
    /** 센서 시뮬레이터(/api/dev/simulator)를 켤지. 지정하지 않으면 운영(production)에서만 끈다. */
    SIMULATOR_ENABLED: z.stringbool().optional(),
    /** 브라우저 푸시(Web Push)용 VAPID 키. 세 값이 모두 있어야 푸시가 켜지고, 서버 전용이다. */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** 푸시 서비스가 운영자를 식별하는 연락처. mailto: 또는 https: 로 시작해야 한다. */
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, 'mailto: 또는 https:// 로 시작해야 합니다.')
      .optional(),
  })
  .superRefine((env, ctx) => {
    const set = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT].filter(Boolean)
    if (set.length > 0 && set.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['VAPID_PUBLIC_KEY'],
        message:
          'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT 는 모두 지정하거나 모두 비워야 합니다.',
      })
    }
  })
  .transform((env) => ({
    ...env,
    VAPID:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
        ? {
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          }
        : null,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    SIMULATOR_ENABLED: env.SIMULATOR_ENABLED ?? env.NODE_ENV !== 'production',
  }))

export type Env = z.output<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    throw new Error(`환경변수 설정이 올바르지 않습니다.\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
