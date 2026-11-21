import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('스키마 실행 방식(JIT) 설정', () => {
  it('서버(Node)에서는 Zod 기본 동작을 바꾸지 않는다', async () => {
    vi.resetModules()
    const { z } = await import('./zod')
    expect(z.config().jitless).toBeFalsy()
  })

  it('브라우저에서는 eval 을 쓰지 않도록 JIT 를 끈다 (엄격한 CSP 에서 위반이 나지 않게)', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    const { z } = await import('./zod')
    expect(z.config().jitless).toBe(true)
    // 꺼져 있어도 검증 결과는 같다
    const schema = z.object({ n: z.number().int() })
    expect(schema.safeParse({ n: 1 }).success).toBe(true)
    expect(schema.safeParse({ n: 1.5 }).success).toBe(false)
  })
})
