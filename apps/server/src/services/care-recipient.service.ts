import type { CareRecipientDto, CareRecipientCreate, CareRecipientUpdate } from '@tetris/shared'
import type { CareRecipient } from '@/generated/prisma/client'
import type { CareRecipientRepository } from '@/repositories/care-recipient.repository'
import { AppError } from '@/utils/errors'

function toDto(row: CareRecipient): CareRecipientDto {
  return {
    id: row.id,
    displayName: row.alias,
    notes: row.memo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 보호 대상. 지금은 가구마다 한 명이다. (docs/DATABASE.md — 여러 명은 아직 지원하지 않는다)
 * 이름은 별칭만 받고, 진단·의료 정보는 받지 않는다.
 */
export class CareRecipientService {
  constructor(private readonly repository: CareRecipientRepository) {}

  async list(householdId: string): Promise<CareRecipientDto[]> {
    return (await this.repository.findAll(householdId)).map(toDto)
  }

  async create(householdId: string, input: CareRecipientCreate): Promise<CareRecipientDto> {
    if ((await this.repository.findAll(householdId)).length > 0) {
      throw AppError.conflict(
        '이미 보호 대상이 등록되어 있습니다. 이 버전은 가구마다 한 명만 등록할 수 있습니다.',
      )
    }
    return toDto(
      await this.repository.create(householdId, {
        alias: input.displayName,
        memo: input.notes ?? null,
      }),
    )
  }

  async update(
    householdId: string,
    id: string,
    input: CareRecipientUpdate,
  ): Promise<CareRecipientDto> {
    const existing = await this.repository.findOwned(householdId, id)
    if (!existing) throw AppError.notFound('보호 대상을 찾을 수 없습니다.')
    return toDto(
      await this.repository.update(id, {
        ...(input.displayName !== undefined ? { alias: input.displayName } : {}),
        ...(input.notes !== undefined ? { memo: input.notes } : {}),
      }),
    )
  }
}
