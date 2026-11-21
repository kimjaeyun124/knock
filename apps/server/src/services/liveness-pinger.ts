import type { Logger } from '@/utils/logger'

export type PingOutcome = 'SENT' | 'UNHEALTHY' | 'FAILED'

export interface LivenessPingerOptions {
  /** 운영자가 정한 외부 감시 주소(https). 값에 비밀 토큰이 들어 있을 수 있어 로그에는 호스트만 남긴다. */
  url: string
  /** 서버가 정말 일하고 있는가. 던지면 건강하지 않은 것으로 보고 신호를 보내지 않는다. */
  check: () => Promise<void>
  logger: Logger
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * 외부 감시 서비스(예: Healthchecks.io, Uptime Kuma 의 "push" 모니터)에 "나는 살아 있다"는 신호를 주기적으로 보낸다.
 *
 * 서버가 멈추면 서버가 보내는 알림도 멈추므로, **신호가 끊기는 것을 외부 서비스가 알아채 따로 알려 주게 하는 장치**다.
 * - 서버가 건강할 때만 보낸다. (DB 를 읽을 수 있고, 연결 점검이 최근에 돌았을 때) 건강하지 않으면 보내지 않아 외부 감시가 경고한다.
 * - 보내는 내용은 없다. (GET 한 번. 가구·센서·알림 정보를 담지 않는다)
 * - 감시 서비스가 느리거나 실패해도 서버 동작에 영향이 없다. (시간 제한 후 기록만)
 */
export class LivenessPinger {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly host: string

  constructor(private readonly options: LivenessPingerOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 5_000
    this.host = new URL(options.url).hostname
  }

  async ping(): Promise<PingOutcome> {
    try {
      await this.options.check()
    } catch (error) {
      this.options.logger.warn(
        { err: error },
        '서버가 건강하지 않아 외부 감시 신호를 보내지 않습니다.',
      )
      return 'UNHEALTHY'
    }
    try {
      const response = await this.fetchImpl(this.options.url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      })
      if (!response.ok) {
        this.options.logger.warn(
          { host: this.host, status: response.status },
          '외부 감시 서비스가 신호를 받지 않았습니다.',
        )
        return 'FAILED'
      }
      return 'SENT'
    } catch (error) {
      this.options.logger.warn(
        { host: this.host, err: error instanceof Error ? error.name : 'error' },
        '외부 감시 신호를 보내지 못했습니다.',
      )
      return 'FAILED'
    }
  }
}
