import { randomBytes } from 'node:crypto'
import { SESSION_TTL_MS } from '@/config/auth'
import type { PrismaClient } from '@/db/client'
import { hashToken } from '@/utils/tokens'

export interface AuthContext {
  /** 세션 토큰의 해시 (DB 기본키). 토큰 원문이 아니다. */
  sessionId: string
  guardianId: string
  householdId: string
}

/**
 * 로그인 세션. 브라우저에는 무작위 토큰만 주고, DB에는 그 해시만 저장한다.
 * 따라서 DB가 유출되어도 세션 쿠키 값을 만들어 낼 수 없다.
 */
export class SessionService {
  private readonly revokeListeners = new Set<(sessionId: string) => void>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
  ) {}

  /** 세션이 사라질 때(로그아웃·만료) 호출된다. 실시간 연결을 끊는 데 쓴다. */
  onRevoke(listener: (sessionId: string) => void): () => void {
    this.revokeListeners.add(listener)
    return () => {
      this.revokeListeners.delete(listener)
    }
  }

  async create(guardianId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS)
    await this.prisma.session.create({ data: { id: hashToken(token), guardianId, expiresAt } })
    return { token, expiresAt }
  }

  /** 유효한 세션이면 인증 정보를, 없거나 만료되었으면 null 을 돌려준다. */
  async validate(token: string): Promise<AuthContext | null> {
    const sessionId = hashToken(token)
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { guardian: { select: { householdId: true } } },
    })
    if (!session) return null
    if (session.expiresAt.getTime() <= this.now().getTime()) {
      await this.removeSessions([sessionId])
      return null
    }
    return { sessionId, guardianId: session.guardianId, householdId: session.guardian.householdId }
  }

  async revoke(token: string): Promise<void> {
    await this.removeSessions([hashToken(token)])
  }

  /** 한 보호자의 세션 중 지정한 것(현재 기기)만 남기고 모두 끊는다. 끊은 개수를 돌려준다. */
  async revokeOthers(guardianId: string, keepSessionId: string): Promise<number> {
    const others = await this.prisma.session.findMany({
      where: { guardianId, id: { not: keepSessionId } },
      select: { id: true },
    })
    return this.removeSessions(others.map((s) => s.id))
  }

  /** 만료된 세션을 지운다. 지운 개수를 돌려준다. */
  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.session.findMany({
      where: { expiresAt: { lte: this.now() } },
      select: { id: true },
    })
    return this.removeSessions(expired.map((s) => s.id))
  }

  private async removeSessions(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const { count } = await this.prisma.session.deleteMany({ where: { id: { in: ids } } })
    if (count > 0) ids.forEach((id) => this.revokeListeners.forEach((listener) => listener(id)))
    return count
  }
}
