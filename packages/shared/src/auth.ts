import { z } from './zod'

/** 이메일은 앞뒤 공백을 지우고 소문자로 맞춘 뒤 검사한다. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  // 길이 상한은 비밀번호 해시 계산에 과도한 비용이 들지 않게 하기 위한 것
  password: z.string().min(1).max(200),
})
export type LoginRequest = z.input<typeof LoginRequestSchema>

export const GuardianSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
})

export const HouseholdSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 돌봄 대상 호칭(별칭). 아직 설정하지 않았으면 null */
  recipientAlias: z.string().nullable(),
})

/** 로그인 성공과 현재 로그인 확인(me)의 공통 응답 */
export const AuthSessionResponseSchema = z.object({
  guardian: GuardianSummarySchema,
  household: HouseholdSummarySchema,
})
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>

/**
 * POST /api/auth/mobile/login — 휴대폰 앱용 로그인.
 * 앱은 브라우저 쿠키를 쓰지 않으므로 세션 토큰을 직접 받아 기기의 보안 저장소에 두고,
 * 이후 요청에 `Authorization: Bearer <token>`, 실시간 연결에 `auth.token` 으로 보낸다.
 */
export const MobileLoginResponseSchema = AuthSessionResponseSchema.extend({
  token: z.string().min(20),
  expiresAt: z.iso.datetime(),
})
export type MobileLoginResponse = z.infer<typeof MobileLoginResponseSchema>

export const LogoutResponseSchema = z.object({ ok: z.literal(true) })
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>

/** 계정 비밀번호 최소 길이 */
export const MIN_PASSWORD_LENGTH = 12

/**
 * POST /api/auth/register — 서버에 보호자가 한 명도 없을 때만 받는다. (첫 설정)
 * 이후 계정은 이 경로로 만들 수 없다.
 */
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
    .max(200),
  displayName: z.string().trim().min(1, '표시 이름을 입력해 주세요.').max(30),
})
export type RegisterRequest = z.input<typeof RegisterRequestSchema>

/** POST /api/auth/password — 로그인한 보호자가 자기 비밀번호를 바꾼다. */
export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요.').max(200),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
      .max(200),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
  })
export type ChangePasswordRequest = z.input<typeof ChangePasswordRequestSchema>

export const ChangePasswordResponseSchema = z.object({
  ok: z.literal(true),
  /** 이 기기를 뺀 다른 기기의 로그인을 끊은 수 */
  signedOutOtherSessions: z.number().int().min(0),
})
export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>

/** GET /api/auth/setup-status — 로그인 전에도 볼 수 있다. */
export const SetupStatusResponseSchema = z.object({ needsSetup: z.boolean() })
export type SetupStatusResponse = z.infer<typeof SetupStatusResponseSchema>
