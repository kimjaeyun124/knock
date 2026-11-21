import { describe, expect, it } from 'vitest'
import { parseCookies } from './cookies'
import { isAllowedOrigin } from './origin'

describe('parseCookies', () => {
  it('여러 쿠키를 읽고 값의 따옴표와 퍼센트 인코딩을 처리한다', () => {
    const cookies = parseCookies('a=1; b="two"; c=%ED%95%9C')
    expect(cookies.get('a')).toBe('1')
    expect(cookies.get('b')).toBe('two')
    expect(cookies.get('c')).toBe('한')
  })

  it('헤더가 없거나 형식이 깨져도 예외를 던지지 않는다', () => {
    expect(parseCookies(undefined).size).toBe(0)
    expect(parseCookies('novalue; =x; %E0%A4%A=y').size).toBeGreaterThanOrEqual(0)
  })

  it('__proto__ 같은 이름의 쿠키가 객체 프로토타입을 오염시키지 않는다', () => {
    const cookies = parseCookies('__proto__=polluted; x=1')
    expect(cookies.get('__proto__')).toBe('polluted')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('값에 = 가 들어 있어도 첫 번째 = 로만 나눈다', () => {
    expect(parseCookies('token=abc==').get('token')).toBe('abc==')
  })
})

describe('isAllowedOrigin', () => {
  const allowed = ['http://localhost:5173']

  it('설정된 웹 출처를 허용한다', () => {
    expect(isAllowedOrigin('http://localhost:5173', allowed, 'localhost:4000')).toBe(true)
  })

  it('서버 자신의 출처(같은 출처 배포)를 허용한다', () => {
    expect(isAllowedOrigin('https://care.example.org', allowed, 'care.example.org')).toBe(true)
  })

  it('그 외 출처는 거부한다', () => {
    expect(isAllowedOrigin('https://evil.example', allowed, 'localhost:4000')).toBe(false)
    expect(isAllowedOrigin('http://localhost:5174', allowed, undefined)).toBe(false)
  })
})
