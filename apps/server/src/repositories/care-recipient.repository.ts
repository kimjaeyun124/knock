import type { PrismaClient } from '@/db/client'
import type { CareRecipient } from '@/generated/prisma/client'

/** 보호 대상 저장소. DB 접근만 맡고, 모든 조회는 가구(householdId)로 한정한다. */
export class CareRecipientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(householdId: string): Promise<CareRecipient[]> {
    return this.prisma.careRecipient.findMany({
      where: { householdId },
      orderBy: { createdAt: 'asc' },
    })
  }

  findOwned(householdId: string, id: string): Promise<CareRecipient | null> {
    return this.prisma.careRecipient.findFirst({ where: { id, householdId } })
  }

  create(
    householdId: string,
    data: { alias: string; memo: string | null },
  ): Promise<CareRecipient> {
    return this.prisma.careRecipient.create({ data: { householdId, ...data } })
  }

  update(id: string, data: { alias?: string; memo?: string | null }): Promise<CareRecipient> {
    return this.prisma.careRecipient.update({ where: { id }, data })
  }
}
