import {
  DEFAULT_DETECTION_SETTINGS,
  weekdaysToMask,
  RegisterRequestSchema,
  ChangePasswordRequestSchema,
  type AuthSessionResponse,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type RegisterRequest,
} from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { AppError } from '@/utils/errors'
import type { LoginThrottle } from '@/utils/login-throttle'
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/utils/password'
import type { AuthContext, SessionService } from './session.service'

/** 계정이 없을 때와 비밀번호가 틀렸을 때 같은 문구를 쓴다. (가입된 이메일을 알아내지 못하게) */
const INVALID_CREDENTIALS = '이메일 또는 비밀번호가 올바르지 않습니다.'

interface GuardianWithHousehold {
  id: string
  email: string
  displayName: string
  household: { id: string; name: string; recipient: { alias: string } | null }
}

function toSessionResponse(guardian: GuardianWithHousehold): AuthSessionResponse {
  return {
    guardian: { id: guardian.id, email: guardian.email, displayName: guardian.displayName },
    household: {
      id: guardian.household.id,
      name: guardian.household.name,
      recipientAlias: guardian.household.recipient?.alias ?? null,
    },
  }
}

const guardianInclude = {
  household: { select: { id: true, name: true, recipient: { select: { alias: true } } } },
} as const

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
  ) {}

  async login(input: {
    email: string
    password: string
    /** 접속 IP 등 요청 출처 */
    clientKey: string
  }): Promise<{ token: string; expiresAt: Date; session: AuthSessionResponse }> {
    const throttleKey = `${input.clientKey}|${input.email}`
    const retryAfter = this.throttle.retryAfterSeconds(throttleKey)
    if (retryAfter > 0) {
      throw AppError.rateLimited(
        `로그인 시도가 너무 많습니다. ${Math.ceil(retryAfter / 60)}분 뒤에 다시 시도해 주세요.`,
      )
    }

    const guardian = await this.prisma.guardian.findUnique({
      where: { email: input.email },
      include: guardianInclude,
    })

    let valid = false
    if (guardian) {
      valid = await verifyPassword(input.password, guardian.passwordHash)
    } else {
      await verifyAgainstDummy(input.password)
    }

    if (!guardian || !valid) {
      this.throttle.recordFailure(throttleKey)
      throw new AppError(401, 'UNAUTHORIZED', INVALID_CREDENTIALS)
    }

    this.throttle.reset(throttleKey)
    const { token, expiresAt } = await this.sessions.create(guardian.id)
    return { token, expiresAt, session: toSessionResponse(guardian) }
  }

  /**
   * 비밀번호를 바꾼다. 현재 비밀번호를 다시 확인하고(틀리면 로그인과 같은 시도 제한), 바꾸면 **이 기기를 뺀 모든 기기의 로그인을 끊는다.**
   * (비밀번호가 유출되었을 때 이전 세션이 남아 있지 않게)
   */
  async changePassword(
    auth: AuthContext,
    input: ChangePasswordRequest,
    clientKey: string,
  ): Promise<ChangePasswordResponse> {
    const parsed = ChangePasswordRequestSchema.parse(input)
    const throttleKey = `password|${clientKey}|${auth.guardianId}`
    const retryAfter = this.throttle.retryAfterSeconds(throttleKey)
    if (retryAfter > 0) {
      throw AppError.rateLimited(
        `비밀번호 확인 시도가 너무 많습니다. ${Math.ceil(retryAfter / 60)}분 뒤에 다시 시도해 주세요.`,
      )
    }
    const guardian = await this.prisma.guardian.findUnique({ where: { id: auth.guardianId } })
    if (!guardian) throw AppError.unauthorized()
    if (!(await verifyPassword(parsed.currentPassword, guardian.passwordHash))) {
      this.throttle.recordFailure(throttleKey)
      // 401 은 "로그인이 풀렸다"는 뜻으로 화면이 로그인으로 돌려보내므로 쓰지 않는다.
      throw AppError.badRequest('현재 비밀번호가 올바르지 않습니다.')
    }
    this.throttle.reset(throttleKey)
    await this.prisma.guardian.update({
      where: { id: guardian.id },
      data: { passwordHash: await hashPassword(parsed.newPassword) },
    })
    const signedOutOtherSessions = await this.sessions.revokeOthers(guardian.id, auth.sessionId)
    return { ok: true, signedOutOtherSessions }
  }

  /** 서버에 보호자가 한 명도 없어 첫 계정을 만들어야 하는가 */
  async needsSetup(): Promise<boolean> {
    return (await this.prisma.guardian.count()) === 0
  }

  /**
   * 첫 계정(가구 + 보호자)을 만들고 로그인시킨다.
   * 보호자가 이미 있으면 거부한다. 누구나 계정을 만들 수 있는 서버가 되지 않게 하기 위해서다.
   */
  async register(
    input: RegisterRequest,
  ): Promise<{ token: string; expiresAt: Date; session: AuthSessionResponse }> {
    const parsed = RegisterRequestSchema.parse(input)
    const passwordHash = await hashPassword(parsed.password)
    const guardian = await this.prisma.$transaction(async (tx) => {
      // 같은 트랜잭션에서 확인해, 동시에 두 요청이 와도 한쪽만 만들어진다.
      if ((await tx.guardian.count()) > 0) {
        throw AppError.forbidden('이미 설정된 서버입니다. 계정은 기존 보호자가 관리합니다.')
      }
      const household = await tx.household.create({
        data: {
          name: `${parsed.displayName}의 가구`,
          recipient: { create: { alias: '어르신' } },
          settings: {
            create: {
              ...DEFAULT_DETECTION_SETTINGS,
              activeWeekdays: weekdaysToMask(DEFAULT_DETECTION_SETTINGS.activeWeekdays),
            },
          },
          guardians: {
            create: { email: parsed.email, displayName: parsed.displayName, passwordHash },
          },
        },
        include: { guardians: { include: guardianInclude } },
      })
      const created = household.guardians[0]
      if (!created) throw new Error('보호자를 만들지 못했습니다.')
      return created
    })
    const { token, expiresAt } = await this.sessions.create(guardian.id)
    return { token, expiresAt, session: toSessionResponse(guardian) }
  }

  async me(auth: AuthContext): Promise<AuthSessionResponse> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: auth.guardianId },
      include: guardianInclude,
    })
    if (!guardian) throw AppError.unauthorized()
    return toSessionResponse(guardian)
  }
}
