import { randomUUID } from 'node:crypto'
import {
  ZONE_KINDS,
  ZONE_LABELS,
  findScenario,
  type ScenarioAction,
  type SimulatorMotionRequest,
  type SimulatorSendResult,
  type SimulatorSpeed,
  type SimulatorState,
  type ZoneKind,
} from '@tetris/shared'
import { IngestClient, IngestError, playScenario } from '@tetris/simulator'
import type { PrismaClient } from '@/db/client'
import { effectiveOfflineAfterSeconds } from '@/domain/sensor-status'
import { isMonitoredTime } from '@/domain/time'
import { AppError } from '@/utils/errors'
import type { Logger } from '@/utils/logger'
import { Scheduler } from '@/utils/scheduler'
import type { FaultInjector } from './fault-injector'
import type { SensorService } from './sensor.service'
import type { SettingsService } from './settings.service'

/** 시뮬레이션 센서가 처음에 보고하는 배터리 */
const DEFAULT_BATTERY_PERCENT = 90
/** 최근 전송 기록을 보관하는 개수 */
const RECENT_LIMIT = 30
/** "야간으로 보내기"가 거슬러 올라가 찾는 최대 시간. 수집 계약의 허용 나이(24시간)보다 짧게 둔다. */
const NIGHT_SEARCH_HOURS = 23

/** 시뮬레이션 센서의 heartbeat 간격. 연결 끊김 기준(기본 5분)보다 훨씬 짧게 둔다. */
export const SIMULATOR_HEARTBEAT_INTERVAL_MS = 30_000

interface SensorLink {
  sensorId: string
  token: string
}

interface RunningScenario {
  scenarioId: string
  speed: SimulatorSpeed
  startedAt: Date
  completed: number
  total: number
  abort: AbortController
  done: Promise<void>
}

interface HouseholdRuntime {
  links: Map<ZoneKind, SensorLink>
  battery: Map<ZoneKind, number>
  silenced: Set<ZoneKind>
  recent: SimulatorSendResult[]
  run: RunningScenario | null
  lastRun: SimulatorState['lastRun']
}

export interface SimulatorServiceOptions {
  prisma: PrismaClient
  sensors: SensorService
  settings: SettingsService
  faults: FaultInjector
  now: () => Date
  logger: Logger
  /** 수집 API 주소. 서버가 자기 자신의 수집 API 를 실제 센서와 똑같이 HTTP 로 부른다. */
  ingestBaseUrl: string
  /**
   * 연결 점검을 지금 실행한다. ("끊김 바로 확인"에서 주기 점검을 기다리지 않으려고 쓴다. 서버의 실제 점검 함수를 그대로 부른다.)
   */
  checkConnections?: () => Promise<unknown>
  /** 테스트에서 기다리는 시간을 없애려고 바꾼다. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

/**
 * 센서 시뮬레이터. 시뮬레이션 센서(origin=SIMULATED)를 만들고 신호를 보낸다.
 *
 * 핵심 원칙: 신호는 항상 **실제 센서와 같은 수집 API**(장치 토큰 인증)로 보낸다.
 * 서비스 내부 함수를 직접 부르는 지름길이 없으므로, 시뮬레이터로 검증한 경로가 곧 실제 센서의 경로다.
 */
export class SimulatorService {
  private readonly runtimes = new Map<string, HouseholdRuntime>()
  private readonly heartbeats: Scheduler
  private ingestBaseUrl: string

  constructor(private readonly options: SimulatorServiceOptions) {
    this.ingestBaseUrl = options.ingestBaseUrl
    this.heartbeats = new Scheduler(
      '시뮬레이터 heartbeat',
      () => this.tickHeartbeats(),
      SIMULATOR_HEARTBEAT_INTERVAL_MS,
      options.logger,
    )
  }

  /** 서버가 실제로 열린 주소를 알게 된 뒤 지정한다. (테스트는 임시 포트를 쓴다) */
  setIngestBaseUrl(url: string): void {
    this.ingestBaseUrl = url
  }

  /** 시뮬레이션 센서가 주기적으로 heartbeat 를 보내게 한다. (멈춘 센서는 보내지 않는다) */
  start(): void {
    this.heartbeats.start()
  }

  stop(): void {
    this.heartbeats.stop()
    for (const runtime of this.runtimes.values()) runtime.run?.abort.abort()
  }

  /** 시뮬레이션 데이터를 지운 뒤 기억하고 있던 센서 정보를 버린다. */
  forget(householdId: string): void {
    this.runtimes.get(householdId)?.run?.abort.abort()
    this.runtimes.delete(householdId)
  }

  async getState(householdId: string): Promise<SimulatorState> {
    const runtime = this.runtime(householdId)
    const [rows, rules] = await Promise.all([
      this.options.prisma.sensor.findMany({
        where: { householdId, origin: 'SIMULATED' },
        orderBy: { createdAt: 'asc' },
      }),
      this.options.settings.getRules(householdId),
    ])
    const sensors = await Promise.all(
      ZONE_KINDS.map(async (zone) => {
        const row = rows.find((candidate) => candidate.zone === zone)
        return {
          zone,
          sensor: row ? await this.options.sensors.present(row) : null,
          silenced: runtime.silenced.has(zone),
          batteryPercent: runtime.battery.get(zone) ?? null,
        }
      }),
    )
    const run = runtime.run
    return {
      sensors,
      recent: runtime.recent,
      running: run
        ? {
            scenarioId: run.scenarioId,
            speed: run.speed,
            startedAt: run.startedAt.toISOString(),
            completedSteps: run.completed,
            totalSteps: run.total,
          }
        : null,
      lastRun: runtime.lastRun,
      deliveryFailure: this.options.faults.deliveryFailureState(),
      night: {
        start: rules.nightStart,
        end: rules.nightEnd,
        // 알림을 판단하는 시간인가 (모니터링이 켜져 있고, 요일·야간 시간에 든다)
        isNightNow: isMonitoredTime(this.options.now(), rules),
        sensitivity: rules.sensitivity,
      },
    }
  }

  /** 시뮬레이션 센서를 만들고(없으면) 첫 신호를 보낸다. 구역을 주면 그 구역만, 아니면 세 구역 모두. */
  async ensureSensors(householdId: string, only?: ZoneKind): Promise<void> {
    const runtime = this.runtime(householdId)
    for (const zone of only ? [only] : ZONE_KINDS) {
      await this.link(householdId, zone)
      if (!runtime.silenced.has(zone)) await this.heartbeat(householdId, zone)
    }
  }

  /**
   * 구역의 시뮬레이션 센서를 연결 해제(삭제)한다. 그 센서가 보낸 움직임 기록도 함께 지워진다.
   * 실제 센서는 지우지 않는다. (origin=SIMULATED 인 센서만 찾는다)
   */
  async removeSensor(householdId: string, zone: ZoneKind): Promise<void> {
    const row = await this.options.prisma.sensor.findFirst({
      where: { householdId, origin: 'SIMULATED', zone },
      orderBy: { createdAt: 'asc' },
    })
    if (!row) throw AppError.notFound('이 구역에는 시뮬레이션 센서가 없습니다.')
    // 센서 삭제 규칙(사용 중인 센서는 먼저 끈다)을 그대로 따른다.
    await this.options.sensors.update(householdId, row.id, { isActive: false })
    await this.options.sensors.remove(householdId, row.id)
    const runtime = this.runtime(householdId)
    runtime.links.delete(zone)
    runtime.silenced.delete(zone)
    runtime.battery.delete(zone)
  }

  /**
   * 움직임 신호를 수집 API 로 보낸다.
   *  mode  single 한 건 / burst 같은 구역에서 여러 건 / duplicate 같은 이벤트 ID 두 번(첫 번째 저장, 두 번째 중복)
   *  when  now 지금 / night 가장 최근의 야간(모니터링) 시간대에 일어난 것으로 (낮에도 야간 규칙을 시험)
   */
  async motion(
    householdId: string,
    zone: ZoneKind,
    options: Partial<Pick<SimulatorMotionRequest, 'mode' | 'count' | 'when'>> = {},
  ): Promise<void> {
    const mode = options.mode ?? 'single'
    const count = mode === 'burst' ? (options.count ?? 5) : 1
    // invalid: 수집 계약이 받지 않는 오래된 발생 시각. 서버가 거부하고 센서의 수신 오류로 기록하는지 시험한다.
    const occurredAt =
      mode === 'invalid'
        ? new Date(this.options.now().getTime() - 25 * 60 * 60_000)
        : options.when === 'night'
          ? await this.nightInstant(householdId)
          : null
    const eventId = randomUUID()
    const base =
      mode === 'invalid'
        ? '잘못된 신호 1건 (25시간 전 발생으로 전송 — 서버가 거부해야 함)'
        : mode === 'duplicate'
          ? '움직임 1건 (같은 이벤트를 두 번 전송)'
          : mode === 'burst'
            ? `움직임 ${count}건 (한 번에 전송)`
            : '움직임 1건'
    const label = options.when === 'night' ? `${base} · 야간으로 전송` : base

    await this.recorded(householdId, zone, label, occurredAt, async () => {
      const sendOnce = async (id?: string) => {
        const response = await this.call(householdId, zone, (client) =>
          client.sendMotion({
            ...(id ? { eventId: id } : { count }),
            ...(occurredAt ? { occurredAt } : {}),
          }),
        )
        return response.results.map((r) => ({
          eventId: r.eventId,
          status: r.status,
          reason: r.reason ?? null,
        }))
      }
      const first = await sendOnce(mode === 'duplicate' ? eventId : undefined)
      const second = mode === 'duplicate' ? await sendOnce(eventId) : []
      return [...first, ...second]
    })

    const rejected = this.runtime(householdId).recent[0]?.requests.find(
      (r) => r.status === 'REJECTED',
    )
    if (rejected && mode !== 'invalid') {
      throw AppError.conflict(
        `수집 API 가 신호를 받지 않았습니다. (${rejected.reason ?? '이유 없음'})`,
      )
    }
  }

  /**
   * 가장 최근의 "알림을 판단하는 시간"을 찾는다. 지금이 그 시간이면 null(서버가 받은 시각을 씀),
   * 아니면 5분 단위로 거슬러 올라가 처음 만나는 시각을 쓴다. 수집 계약상 너무 오래된 신호는 거부되므로 23시간까지만 찾는다.
   */
  private async nightInstant(householdId: string): Promise<Date | null> {
    const rules = await this.options.settings.getRules(householdId)
    const now = this.options.now()
    if (isMonitoredTime(now, rules)) return null
    for (let step = 1; step <= (NIGHT_SEARCH_HOURS * 60) / 5; step += 1) {
      const candidate = new Date(now.getTime() - step * 5 * 60_000)
      if (isMonitoredTime(candidate, rules)) return candidate
    }
    throw AppError.conflict(
      `최근 ${NIGHT_SEARCH_HOURS}시간 안에 알림을 판단하는 야간 시간이 없습니다. 설정에서 모니터링 사용·요일·야간 시간을 확인해 주세요.`,
    )
  }

  /**
   * 전송 하나를 실행하고 결과를 최근 기록에 남긴다.
   * 전송 전후의 알림 목록을 비교해 "이 전송으로 새로 생긴 알림"도 함께 기록한다. (알림은 수집 API 응답을 돌려주기 전에 만들어진다)
   * 전송이 실패해도 기록은 남기고 오류는 그대로 다시 던진다.
   */
  private async recorded(
    householdId: string,
    zone: ZoneKind,
    label: string,
    occurredAt: Date | null,
    run: () => Promise<SimulatorSendResult['requests']>,
  ): Promise<void> {
    const { prisma } = this.options
    const before = new Set(
      (await prisma.alert.findMany({ where: { householdId }, select: { id: true } })).map(
        (alert) => alert.id,
      ),
    )
    let requests: SimulatorSendResult['requests'] = []
    let failure: Error | null = null
    try {
      requests = await run()
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
    }
    const newAlerts = (
      await prisma.alert.findMany({
        where: { householdId },
        select: { id: true, type: true, severity: true, title: true },
        orderBy: { triggeredAt: 'asc' },
      })
    ).filter((alert) => !before.has(alert.id))
    const sensorId = this.runtime(householdId).links.get(zone)?.sensorId
    const sensor = sensorId
      ? await prisma.sensor.findUnique({ where: { id: sensorId }, select: { name: true } })
      : null
    const runtime = this.runtime(householdId)
    runtime.recent.unshift({
      id: randomUUID(),
      at: this.options.now().toISOString(),
      zone,
      sensorName: sensor?.name ?? null,
      label,
      ok: failure === null && requests.every((request) => request.status !== 'REJECTED'),
      requests,
      newAlerts,
      occurredAt: occurredAt?.toISOString() ?? null,
      error: failure?.message ?? null,
    })
    runtime.recent.length = Math.min(runtime.recent.length, RECENT_LIMIT)
    if (failure) throw failure
  }

  /**
   * heartbeat(연결 확인·배터리 보고)를 수집 API 로 보낸다.
   * label 을 주면 최근 전송 기록에 남긴다. (30초마다 자동으로 보내는 것은 기록하지 않는다)
   */
  async heartbeat(householdId: string, zone: ZoneKind, label?: string): Promise<void> {
    const battery = this.runtime(householdId).battery.get(zone) ?? DEFAULT_BATTERY_PERCENT
    const send = () =>
      this.call(householdId, zone, (client) => client.sendHeartbeat({ batteryPercent: battery }))
    if (!label) {
      await send()
      return
    }
    await this.recorded(householdId, zone, label, null, async () => {
      await send()
      return [{ eventId: null, status: 'OK' as const, reason: null }]
    })
  }

  /** 배터리 값을 바꾼다. 멈춘(연결 끊은) 센서는 값만 저장하고 신호는 보내지 않는다. */
  async setBattery(householdId: string, zone: ZoneKind, batteryPercent: number): Promise<void> {
    const runtime = this.runtime(householdId)
    runtime.battery.set(zone, batteryPercent)
    if (!runtime.silenced.has(zone)) {
      await this.heartbeat(householdId, zone, `배터리 ${batteryPercent}% 보고`)
    } else {
      await this.recorded(
        householdId,
        zone,
        `배터리 ${batteryPercent}%로 바꿈 (신호를 보내지 않는 중이라 서버에는 아직 전달되지 않음)`,
        null,
        () => Promise.resolve([]),
      )
    }
  }

  /**
   * 센서가 신호를 보내지 않게(연결 끊김) 하거나 다시 보내게(연결 복구) 한다.
   * fastForward 는 끊을 때만 쓴다. 신호가 오래 없었던 것처럼 마지막 신호 시각을 끊김 기준 뒤로 돌리고
   * 연결 점검을 바로 실행한다. (기다리지 않고 "연결 끊김" 알림을 보려는 시연용 단축 — 알림은 실제 점검 경로가 만든다)
   */
  async setSilenced(
    householdId: string,
    zone: ZoneKind,
    silenced: boolean,
    fastForward = false,
  ): Promise<void> {
    const runtime = this.runtime(householdId)
    if (!silenced) {
      runtime.silenced.delete(zone)
      await this.heartbeat(householdId, zone, '연결 복구 — 신호 다시 전송')
      return
    }
    const link = await this.link(householdId, zone)
    runtime.silenced.add(zone)
    await this.recorded(
      householdId,
      zone,
      fastForward
        ? '연결 끊김 — 신호가 오래 없었던 것으로 처리하고 연결 점검 실행'
        : '연결 끊김 — 신호 전송 중단',
      null,
      async () => {
        if (fastForward) {
          const thresholds = await this.options.settings.getThresholds(householdId)
          const sensorRow = await this.options.prisma.sensor.findUniqueOrThrow({
            where: { id: link.sensorId },
          })
          const offlineAfterSeconds = effectiveOfflineAfterSeconds(sensorRow, thresholds)
          await this.options.prisma.sensor.update({
            where: { id: link.sensorId },
            data: {
              lastSeenAt: new Date(this.options.now().getTime() - (offlineAfterSeconds + 5) * 1000),
            },
          })
          await this.options.checkConnections?.()
        }
        return []
      },
    )
  }

  setDeliveryFailure(enabled: boolean): void {
    if (enabled) this.options.faults.enableDeliveryFailure()
    else this.options.faults.disableDeliveryFailure()
  }

  async runScenario(householdId: string, scenarioId: string, speed: SimulatorSpeed): Promise<void> {
    const scenario = findScenario(scenarioId)
    if (!scenario) throw AppError.notFound('시나리오를 찾을 수 없습니다.')
    const runtime = this.runtime(householdId)
    if (runtime.run) {
      throw AppError.conflict('이미 시나리오를 재생 중입니다. 먼저 멈춰 주세요.')
    }
    await this.ensureSensors(householdId)

    const abort = new AbortController()
    const run: RunningScenario = {
      scenarioId,
      speed,
      startedAt: this.options.now(),
      completed: 0,
      total: scenario.steps.length,
      abort,
      done: Promise.resolve(),
    }
    runtime.run = run
    run.done = (async () => {
      let outcome: 'COMPLETED' | 'STOPPED' | 'FAILED' = 'FAILED'
      let error: string | null = null
      try {
        outcome = await playScenario(scenario, {
          speed,
          signal: abort.signal,
          ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
          perform: (action) => this.perform(householdId, action),
          onProgress: (completed) => {
            run.completed = completed
          },
        })
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause)
        this.options.logger.error({ err: cause, scenarioId }, '시뮬레이터 시나리오 재생 실패')
      } finally {
        runtime.lastRun = {
          scenarioId,
          endedAt: this.options.now().toISOString(),
          outcome,
          error,
        }
        runtime.run = null
      }
    })()
  }

  stopScenario(householdId: string): void {
    this.runtime(householdId).run?.abort.abort()
  }

  /** 재생 중인 시나리오가 끝날 때까지 기다린다. (테스트·CLI 용) */
  async idle(householdId: string): Promise<void> {
    await this.runtime(householdId).run?.done
  }

  /** 멈추지 않은 시뮬레이션 센서 모두에게 heartbeat 를 보낸다. 실패는 기록만 하고 계속한다. */
  async tickHeartbeats(): Promise<void> {
    for (const [householdId, runtime] of this.runtimes) {
      for (const zone of runtime.links.keys()) {
        if (runtime.silenced.has(zone)) continue
        try {
          await this.heartbeat(householdId, zone)
        } catch (error) {
          this.options.logger.warn({ err: error, zone }, '시뮬레이션 센서 heartbeat 실패')
        }
      }
    }
  }

  private async perform(householdId: string, action: ScenarioAction): Promise<void> {
    switch (action.kind) {
      case 'motion':
        return this.motion(householdId, action.zone)
      case 'heartbeat':
        if (action.batteryPercent !== undefined) {
          this.runtime(householdId).battery.set(action.zone, action.batteryPercent)
        }
        return this.heartbeat(householdId, action.zone)
      case 'silence':
        return this.setSilenced(householdId, action.zone, true)
      case 'resume':
        return this.setSilenced(householdId, action.zone, false)
      case 'deliveryFailure':
        this.setDeliveryFailure(action.enabled)
        return Promise.resolve()
    }
  }

  private runtime(householdId: string): HouseholdRuntime {
    let runtime = this.runtimes.get(householdId)
    if (!runtime) {
      runtime = {
        links: new Map(),
        battery: new Map(),
        silenced: new Set(),
        recent: [],
        run: null,
        lastRun: null,
      }
      this.runtimes.set(householdId, runtime)
    }
    return runtime
  }

  /** 구역의 시뮬레이션 센서와 장치 토큰을 준비한다. 센서가 없으면 만들고, 있으면 토큰을 새로 발급받는다. */
  private async link(householdId: string, zone: ZoneKind, fresh = false): Promise<SensorLink> {
    const runtime = this.runtime(householdId)
    const existing = runtime.links.get(zone)
    if (existing && !fresh) return existing

    const row = await this.options.prisma.sensor.findFirst({
      where: { householdId, origin: 'SIMULATED', zone },
      orderBy: { createdAt: 'asc' },
    })
    const issued = row
      ? await this.options.sensors.rotateToken(householdId, row.id)
      : await this.options.sensors.createSimulated(householdId, {
          name: `시뮬레이션 ${ZONE_LABELS[zone]}`,
          zone,
        })
    const link = { sensorId: issued.sensor.id, token: issued.deviceToken }
    runtime.links.set(zone, link)
    return link
  }

  /** 수집 API 호출. 토큰이 무효해졌으면(센서를 지웠거나 토큰을 재발급함) 한 번만 새로 받아 다시 시도한다. */
  private async call<T>(
    householdId: string,
    zone: ZoneKind,
    send: (client: IngestClient) => Promise<T>,
  ): Promise<T> {
    const make = (link: SensorLink) =>
      new IngestClient({ baseUrl: this.ingestBaseUrl, token: link.token })
    try {
      return await send(make(await this.link(householdId, zone)))
    } catch (error) {
      if (!(error instanceof IngestError)) throw error
      if (error.status === 401) {
        try {
          return await send(make(await this.link(householdId, zone, true)))
        } catch (retryError) {
          throw this.toAppError(retryError)
        }
      }
      throw this.toAppError(error)
    }
  }

  private toAppError(error: unknown): unknown {
    if (!(error instanceof IngestError)) return error
    if (error.status >= 400 && error.status < 500) {
      return AppError.conflict(
        `시뮬레이션 센서의 신호를 수집 API 가 받지 않았습니다. ${error.message}`,
      )
    }
    return AppError.serviceUnavailable(`수집 API 에 신호를 보내지 못했습니다. ${error.message}`, {
      cause: error,
    })
  }
}
