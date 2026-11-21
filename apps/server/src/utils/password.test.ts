import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

const CHEAP = { N: 2 ** 10, r: 8, p: 1 }

describe('비밀번호 해시', () => {
  it('같은 비밀번호도 매번 다른 해시가 나오고(솔트), 둘 다 검증된다', async () => {
    const a = await hashPassword('correct horse', CHEAP)
    const b = await hashPassword('correct horse', CHEAP)
    expect(a).not.toBe(b)
    expect(await verifyPassword('correct horse', a)).toBe(true)
    expect(await verifyPassword('correct horse', b)).toBe(true)
  })

  it('해시에 비밀번호 원문이 들어 있지 않다', async () => {
    const hash = await hashPassword('plain-secret-value', CHEAP)
    expect(hash).not.toContain('plain-secret-value')
    expect(hash.startsWith('scrypt$1024$8$1$')).toBe(true)
  })

  it('틀린 비밀번호는 거부한다', async () => {
    const hash = await hashPassword('correct horse', CHEAP)
    expect(await verifyPassword('Correct horse', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('저장된 파라미터로 검증하므로 비용을 바꿔도 이전 해시가 계속 유효하다', async () => {
    const old = await hashPassword('pw', { N: 2 ** 9, r: 8, p: 1 })
    expect(await verifyPassword('pw', old)).toBe(true)
  })

  it.each([
    ['빈 문자열', ''],
    ['형식이 다름', 'bcrypt$abc'],
    ['숫자가 아님', 'scrypt$a$b$c$AAAA$AAAA'],
    ['N이 2의 거듭제곱이 아님', 'scrypt$1000$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'],
    ['N이 너무 큼(서버 자원 소모 방지)', 'scrypt$1073741824$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'],
    ['해시 길이가 다름', 'scrypt$1024$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'],
  ])('깨진 해시는 예외 없이 false 를 돌려준다: %s', async (_name, stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false)
  })
})
