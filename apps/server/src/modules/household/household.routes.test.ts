import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiErrorBodySchema, HouseholdResponseSchema } from '@tetris/shared'
import { createTestContext, type TestContext } from '@/test-utils/context'
import { TestClient } from '@/test-utils/http'

describe('가구 API', () => {
  let ctx: TestContext
  beforeAll(async () => {
    ctx = await createTestContext()
  })
  afterAll(async () => {
    await ctx.close()
  })

  it('로그인하지 않으면 401 이다', async () => {
    const anonymous = new TestClient(ctx.baseUrl)
    expect((await anonymous.get('/api/household')).status).toBe(401)
    expect((await anonymous.put('/api/household', { recipientAlias: '어르신' })).status).toBe(401)
  })

  it('호칭과 초기 설정 완료 여부를 돌려준다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const { household } = HouseholdResponseSchema.parse(
      await (await client.get('/api/household')).json(),
    )
    expect(household).toMatchObject({
      recipientAlias: '어르신(테스트)',
      setupCompleted: false,
      setupCompletedAt: null,
    })
  })

  it('호칭을 바꾸고 서비스 안내 확인을 기록한다 (처음 확인한 시각은 유지)', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const first = HouseholdResponseSchema.parse(
      await (
        await client.put('/api/household', { recipientAlias: '  할머니  ', completeSetup: true })
      ).json(),
    ).household
    expect(first.recipientAlias).toBe('할머니')
    expect(first.setupCompleted).toBe(true)

    ctx.clock.advance(60_000)
    const second = HouseholdResponseSchema.parse(
      await (await client.put('/api/household', { completeSetup: true })).json(),
    ).household
    expect(second.setupCompletedAt).toBe(first.setupCompletedAt)
  })

  it('초기 설정 진행 단계와 메모를 저장한다 (단계는 낮추지 않고, 빈 메모는 지운다)', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const first = HouseholdResponseSchema.parse(
      await (await client.get('/api/household')).json(),
    ).household
    expect(first).toMatchObject({ onboardingStep: 1, recipientMemo: null })

    const saved = HouseholdResponseSchema.parse(
      await (
        await client.put('/api/household', {
          recipientAlias: '어르신',
          recipientMemo: '  밤에 자주 깨심  ',
          onboardingStep: 4,
        })
      ).json(),
    ).household
    expect(saved).toMatchObject({ recipientMemo: '밤에 자주 깨심', onboardingStep: 4 })

    const back = HouseholdResponseSchema.parse(
      await (await client.put('/api/household', { onboardingStep: 2 })).json(),
    ).household
    expect(back.onboardingStep).toBe(4)

    const cleared = HouseholdResponseSchema.parse(
      await (await client.put('/api/household', { recipientMemo: '' })).json(),
    ).household
    expect(cleared.recipientMemo).toBeNull()

    const done = HouseholdResponseSchema.parse(
      await (await client.put('/api/household', { completeSetup: true })).json(),
    ).household
    expect(done).toMatchObject({ setupCompleted: true, onboardingStep: 6 })
  })

  it.each([
    ['201자 메모', { recipientMemo: 'x'.repeat(201) }],
    ['0단계', { onboardingStep: 0 }],
    ['7단계', { onboardingStep: 7 }],
    ['빈 호칭', { recipientAlias: '   ' }],
    ['21자 호칭', { recipientAlias: 'x'.repeat(21) }],
    ['항목 없음', {}],
    ['완료 취소', { completeSetup: false }],
  ])('잘못된 요청은 400: %s', async (_name, body) => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.put('/api/household', body)
    expect(res.status).toBe(400)
    expect(ApiErrorBodySchema.parse(await res.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('다른 가구의 호칭은 바뀌지 않는다', async () => {
    const a = await ctx.loginAs(await ctx.createHousehold())
    const b = await ctx.loginAs(await ctx.createHousehold())
    await a.put('/api/household', { recipientAlias: '가구A' })
    const { household } = HouseholdResponseSchema.parse(
      await (await b.get('/api/household')).json(),
    )
    expect(household.recipientAlias).toBe('어르신(테스트)')
  })

  it('허용되지 않은 출처의 요청은 403 이다', async () => {
    const client = await ctx.loginAs(await ctx.createHousehold())
    const res = await client.put(
      '/api/household',
      { recipientAlias: '가' },
      {
        Origin: 'https://evil.example',
      },
    )
    expect(res.status).toBe(403)
  })
})
