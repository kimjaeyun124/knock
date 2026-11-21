import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger } from './logger'

function capture(): { lines: () => string; destination: Writable } {
  const chunks: string[] = []
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })
  return { lines: () => chunks.join(''), destination }
}

describe('로그의 비밀값 가리기', () => {
  it('비밀번호·장치 토큰·쿠키·푸시 키가 로그에 남지 않는다', () => {
    const { lines, destination } = capture()
    const logger = createLogger({ LOG_LEVEL: 'info' }, destination)
    logger.info(
      {
        password: 'pw-secret-1',
        deviceToken: 'tsn_secret_token',
        body: {
          password: 'pw-secret-2',
          token: 'tok-secret',
          auth: 'auth-secret',
          p256dh: 'p256-secret',
        },
        req: {
          headers: {
            authorization: 'Bearer tsn_header_secret',
            cookie: 'tetris_session=session-secret',
          },
        },
        err: { message: 'boom', config: { headers: { Authorization: 'vapid t=jwt-secret' } } },
        keep: '이 값은 남는다',
      },
      '요청',
    )
    const text = lines()
    for (const secret of [
      'pw-secret-1',
      'pw-secret-2',
      'tsn_secret_token',
      'tok-secret',
      'auth-secret',
      'p256-secret',
      'tsn_header_secret',
      'session-secret',
      'jwt-secret',
    ]) {
      expect(text, `${secret} 가 로그에 남았습니다`).not.toContain(secret)
    }
    expect(text).toContain('[가려짐]')
    expect(text).toContain('이 값은 남는다')
  })
})
