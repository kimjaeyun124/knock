import type { Household, HouseholdUpdate } from '@tetris/shared'
import type { PrismaClient } from '@/db/client'
import { AppError } from '@/utils/errors'

/** 가구 정보(돌봄 대상 호칭, 초기 설정 완료 여부). 모든 조회·수정은 로그인한 가구로만 한정된다. */
export class HouseholdService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date,
  ) {}

  async get(householdId: string): Promise<Household> {
    const row = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: { recipient: true },
    })
    if (!row) throw AppError.notFound('가구 정보를 찾을 수 없습니다.')
    return {
      id: row.id,
      name: row.name,
      recipientAlias: row.recipient?.alias ?? null,
      recipientMemo: row.recipient?.memo ?? null,
      onboardingStep: row.onboardingStep,
      setupCompleted: row.setupCompletedAt !== null,
      setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
    }
  }

  async update(householdId: string, input: HouseholdUpdate): Promise<Household> {
    await this.get(householdId)
    // 빈 메모는 메모를 지우는 것이다.
    const memo = input.recipientMemo === undefined ? undefined : input.recipientMemo || null
    await this.prisma.$transaction(async (tx) => {
      if (input.recipientAlias !== undefined) {
        await tx.careRecipient.upsert({
          where: { householdId },
          create: { householdId, alias: input.recipientAlias, memo: memo ?? null },
          update: { alias: input.recipientAlias, ...(memo !== undefined ? { memo } : {}) },
        })
      } else if (memo !== undefined) {
        // 호칭 없이 메모만 보내면, 호칭이 이미 있는 경우에만 바꾼다.
        const updated = await tx.careRecipient.updateMany({
          where: { householdId },
          data: { memo },
        })
        if (updated.count === 0) {
          throw AppError.badRequest('호칭을 먼저 입력해 주세요.')
        }
      }
      if (input.onboardingStep !== undefined) {
        // 이미 더 멀리 간 기록은 낮추지 않는다. (이전 단계로 돌아가 보아도 진행 기록은 유지)
        const current = await tx.household.findUniqueOrThrow({ where: { id: householdId } })
        if (input.onboardingStep > current.onboardingStep) {
          await tx.household.update({
            where: { id: householdId },
            data: { onboardingStep: input.onboardingStep },
          })
        }
      }
      if (input.completeSetup) {
        // 이미 완료한 경우 처음 확인한 시각을 유지한다.
        const current = await tx.household.findUniqueOrThrow({ where: { id: householdId } })
        if (current.setupCompletedAt === null) {
          await tx.household.update({
            where: { id: householdId },
            data: { setupCompletedAt: this.now(), onboardingStep: 6 },
          })
        }
      }
    })
    return this.get(householdId)
  }
}
