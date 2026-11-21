import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/**
 * 비밀번호 해시: Node 내장 scrypt (추가 패키지 없음).
 * 저장 형식: scrypt$N$r$p$salt(base64)$hash(base64) — 파라미터를 함께 저장하므로
 * 나중에 비용을 올려도 기존 해시를 계속 검증할 수 있다.
 */

export interface ScryptParams {
  N: number
  r: number
  p: number
}

/** OWASP 권장 수준(N=2^17)보다 낮지만 서버 메모리가 작은 홈서버를 고려한 값. 약 32MB 사용 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 }

const KEY_LENGTH = 64
const SALT_LENGTH = 16
/** 저장된 해시의 파라미터가 비정상적으로 커서 서버 자원을 소모하는 것을 막는다. */
const MAX_N = 2 ** 17

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const hash = await derive(password, salt, params)
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

/** 형식이 깨진 해시는 예외 대신 false 를 돌려준다. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nText, rText, pText, saltText, hashText] = parts
  const N = Number(nText)
  const r = Number(rText)
  const p = Number(pText)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  if (N < 2 || N > MAX_N || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) return false

  const salt = Buffer.from(saltText ?? '', 'base64')
  const expected = Buffer.from(hashText ?? '', 'base64')
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false

  const actual = await derive(password, salt, { N, r, p })
  return timingSafeEqual(actual, expected)
}

let dummyHash: Promise<string> | undefined

/**
 * 존재하지 않는 계정으로 로그인을 시도했을 때도 같은 시간만큼 해시 계산을 하도록 한다.
 * (응답 시간 차이로 가입된 이메일을 알아내는 것을 막는다.)
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalization')
  await verifyPassword(password, await dummyHash)
}
