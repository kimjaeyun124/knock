// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY } from '../csp'

describe('Content-Security-Policy', () => {
  it('운영 가이드(docs/OPERATIONS.md)에 적힌 정책이 코드의 정책과 같다', () => {
    const guide = readFileSync(new URL('../../../docs/OPERATIONS.md', import.meta.url), 'utf8')
    expect(guide).toContain(`Content-Security-Policy "${CONTENT_SECURITY_POLICY}"`)
  })

  it('스크립트에는 인라인·eval 을 허용하지 않고 프레임에 넣을 수 없게 한다', () => {
    const scriptSrc = CONTENT_SECURITY_POLICY.split('; ').find((d) => d.startsWith('script-src '))
    expect(scriptSrc).toBe("script-src 'self'")
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval')
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'")
  })
})
