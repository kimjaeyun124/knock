import { z } from './zod'

/** 돌봄 대상 호칭. 실명 대신 "어르신" 같은 호칭만 저장한다. */
export const RecipientAliasSchema = z
  .string()
  .trim()
  .min(1, '호칭을 입력해 주세요.')
  .max(20, '호칭은 20자 이내로 입력해 주세요.')

/** 보호 대상 메모(선택). 개인정보를 최소로 받기 위해 짧게만 받는다. */
export const RecipientMemoSchema = z.string().trim().max(200, '메모는 200자 이내로 입력해 주세요.')

/** 초기 설정 단계 수. 1 서비스 소개 · 2 보호 대상 · 3 센서 · 4 모니터링 시간 · 5 알림 · 6 확인 */
export const ONBOARDING_STEP_COUNT = 6

export const OnboardingStepSchema = z.number().int().min(1).max(ONBOARDING_STEP_COUNT)

export const HouseholdSchema = z.object({
  id: z.string(),
  name: z.string(),
  recipientAlias: z.string().nullable(),
  /** 보호 대상 메모. 없으면 null */
  recipientMemo: z.string().nullable(),
  /** 초기 설정에서 마지막으로 도달한 단계(1~6). 도중에 나가도 이 단계에서 이어 한다. */
  onboardingStep: OnboardingStepSchema,
  /** 초기 설정을 끝내고 서비스 안내를 확인했는지 */
  setupCompleted: z.boolean(),
  setupCompletedAt: z.iso.datetime().nullable(),
})
export type Household = z.infer<typeof HouseholdSchema>

export const HouseholdResponseSchema = z.object({ household: HouseholdSchema })
export type HouseholdResponse = z.infer<typeof HouseholdResponseSchema>

/** PUT /api/household. completeSetup 을 true 로 보내면 서비스 안내를 확인한 것으로 기록한다. */
export const HouseholdUpdateSchema = z
  .object({
    recipientAlias: RecipientAliasSchema.optional(),
    /** 빈 문자열을 보내면 메모를 지운다. */
    recipientMemo: RecipientMemoSchema.optional(),
    /** 도달한 단계. 이미 더 멀리 간 기록이 있으면 낮추지 않는다. */
    onboardingStep: OnboardingStepSchema.optional(),
    completeSetup: z.literal(true).optional(),
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: '바꿀 항목을 하나 이상 보내 주세요.',
  })
export type HouseholdUpdate = z.infer<typeof HouseholdUpdateSchema>

/** API v1 의 보호 대상. 별칭만으로 등록한다. (진단·의료 정보는 받지 않는다) */
export const CareRecipientSchema = z.object({
  id: z.string(),
  /** 실명 대신 "어르신" 같은 호칭 */
  displayName: z.string(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type CareRecipientDto = z.infer<typeof CareRecipientSchema>

const NotesSchema = RecipientMemoSchema

export const CareRecipientCreateSchema = z.strictObject({
  displayName: RecipientAliasSchema,
  /** 비워 두면(빈 문자열) 메모 없음 */
  notes: NotesSchema.optional().transform((value) => (value === '' ? undefined : value)),
})
export type CareRecipientCreate = z.output<typeof CareRecipientCreateSchema>

export const CareRecipientUpdateSchema = z
  .strictObject({
    displayName: RecipientAliasSchema.optional(),
    /** null 이거나 빈 문자열이면 메모를 지운다. */
    notes: NotesSchema.nullable()
      .optional()
      .transform((value) => (value === '' ? null : value)),
  })
  .refine((v) => v.displayName !== undefined || v.notes !== undefined, {
    message: '바꿀 항목을 하나 이상 보내 주세요.',
  })
export type CareRecipientUpdate = z.output<typeof CareRecipientUpdateSchema>
