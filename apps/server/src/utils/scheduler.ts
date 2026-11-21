import type { Logger } from './logger'

/**
 * 일정 간격으로 작업을 실행한다. 이전 실행이 끝나기 전에는 다음 실행을 시작하지 않고,
 * 작업이 실패해도 멈추지 않는다.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly name: string,
    private readonly task: () => Promise<void>,
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn({ task: this.name }, '이전 실행이 끝나지 않아 건너뜁니다.')
      return
    }
    this.running = true
    try {
      await this.task()
    } catch (error) {
      this.logger.error({ err: error, task: this.name }, '주기 작업 실패')
    } finally {
      this.running = false
    }
  }
}
