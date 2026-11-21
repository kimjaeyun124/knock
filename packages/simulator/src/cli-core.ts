import { parseArgs } from 'node:util'
import {
  SCENARIOS,
  SIMULATOR_SPEEDS,
  ZONE_KINDS,
  findScenario,
  scenarioDurationSeconds,
  type SimulatorSpeed,
  type ZoneKind,
} from '@tetris/shared'
import { IngestClient, IngestError } from './client'
import { DevApiError, DevClient } from './dev-client'

export const USAGE = `사용법: npm run sim -- <명령> [옵션]

장치 명령 (장치 토큰으로 수집 API 를 직접 호출)
  heartbeat             상태 신호를 보냅니다. (--battery, --firmware)
  event                 움직임 이벤트를 보냅니다. (--count, --at, --id)

시뮬레이터 명령 (보호자 계정으로 로그인해 서버의 시뮬레이터를 사용. 서버에 SIMULATOR_ENABLED 필요)
  scenarios             시나리오 목록을 보여 줍니다. (서버에 연결하지 않음)
  scenario <id>         시나리오를 재생합니다. (--speed 1|10|60, --wait)
  motion <zone>         시뮬레이션 센서가 움직임을 보냅니다. zone: BED_SIDE | PATH | ENTRANCE
  fault <on|off>        시뮬레이션 알림의 앱 화면 전달 실패를 켜거나 끕니다.
  cleanup               시뮬레이션 데이터(센서·기록·알림)를 모두 지웁니다. 실제 데이터는 그대로입니다.
  demo reset            시연 준비: 시뮬레이션 데이터를 지우고 세 구역의 시뮬레이션 센서를 새로 연결합니다.
                        실제 센서·기록·알림은 건드리지 않으며, 끝나면 남은 실제 데이터 수를 보여 줍니다.
  demo status           시연 상태: 시뮬레이션/실제 데이터 수와 센서 연결 상태를 보여 줍니다. (아무것도 바꾸지 않음)

옵션
  --token <토큰>        장치 토큰. 셸 기록에 남지 않도록 환경변수 TETRIS_DEVICE_TOKEN 사용을 권장합니다.
  --url <주소>          서버 주소 (환경변수 TETRIS_URL, 기본 http://127.0.0.1:4000)
  --battery <0-100>     heartbeat: 배터리 %
  --firmware <문자열>   heartbeat: 펌웨어 버전
  --count <개수>        event: 보낼 이벤트 수 (기본 1, 최대 100)
  --at <ISO 시각>       event: 발생 시각 (생략하면 서버가 받은 시각)
  --id <이벤트ID>       event: 이 ID 로 한 건만 보냅니다. 같은 ID 를 다시 보내 중복 처리를 확인할 수 있습니다.
  --email <이메일>      시뮬레이터 명령: 보호자 이메일 (환경변수 TETRIS_EMAIL)
                        비밀번호는 셸 기록에 남지 않도록 환경변수 TETRIS_PASSWORD 로만 받습니다.
  --speed <1|10|60>     scenario: 배속 (기본 1). 단계 사이의 기다리는 시간만 줄어듭니다.
  --wait                scenario: 재생이 끝날 때까지 기다리고, 실패하면 종료 코드 1
  -h, --help            도움말
`

export interface CliIo {
  out(text: string): void
  err(text: string): void
}

export interface CliDeps {
  fetch?: typeof fetch
  /** 재생 완료를 기다리는 간격. 테스트에서 바꾼다. */
  sleep?: (ms: number) => Promise<void>
}

/** 종료 코드를 돌려준다. (0: 성공, 1: 실패, 2: 사용법 오류) */
export async function runCli(
  argv: string[],
  env: Record<string, string | undefined>,
  io: CliIo,
  deps: CliDeps = {},
): Promise<number> {
  const fetchImpl = deps.fetch
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        token: { type: 'string' },
        url: { type: 'string' },
        battery: { type: 'string' },
        firmware: { type: 'string' },
        count: { type: 'string' },
        at: { type: 'string' },
        id: { type: 'string' },
        email: { type: 'string' },
        speed: { type: 'string' },
        wait: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`)
    return 2
  }

  const { values, positionals } = parsed
  const command = positionals[0]
  if (values.help || !command) {
    io.out(USAGE)
    return values.help ? 0 : 2
  }
  if (['scenarios', 'scenario', 'motion', 'fault', 'cleanup', 'demo'].includes(command)) {
    return runSimulatorCommand(command, positionals.slice(1), values, env, io, deps)
  }
  if (command !== 'heartbeat' && command !== 'event') {
    io.err(`알 수 없는 명령입니다: ${command}\n\n${USAGE}`)
    return 2
  }

  const token = values.token ?? env.TETRIS_DEVICE_TOKEN
  if (!token) {
    io.err(
      '장치 토큰이 필요합니다. TETRIS_DEVICE_TOKEN 환경변수 또는 --token 으로 지정해 주세요.\n',
    )
    return 2
  }
  const client = new IngestClient({
    baseUrl: values.url ?? env.TETRIS_URL ?? 'http://127.0.0.1:4000',
    token,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })

  try {
    if (command === 'heartbeat') {
      const battery = values.battery === undefined ? undefined : Number(values.battery)
      if (battery !== undefined && (!Number.isInteger(battery) || battery < 0 || battery > 100)) {
        io.err('--battery 는 0~100 사이의 정수여야 합니다.\n')
        return 2
      }
      const res = await client.sendHeartbeat({
        ...(battery !== undefined ? { batteryPercent: battery } : {}),
        ...(values.firmware ? { firmware: values.firmware } : {}),
      })
      io.out(`상태 신호를 보냈습니다. (서버 시각 ${res.serverTime})\n`)
      return 0
    }

    const count = values.count === undefined ? 1 : Number(values.count)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      io.err('--count 는 1~100 사이의 정수여야 합니다.\n')
      return 2
    }
    const res = await client.sendMotion({
      count,
      ...(values.at ? { occurredAt: values.at } : {}),
      ...(values.id ? { eventId: values.id } : {}),
    })
    for (const result of res.results) {
      const detail = result.reason ? ` (${result.reason})` : ''
      io.out(`${result.status}${detail}  ${result.eventId}\n`)
    }
    const rejected = res.results.filter((r) => r.status === 'REJECTED').length
    return rejected > 0 ? 1 : 0
  } catch (error) {
    if (error instanceof IngestError) {
      io.err(`실패: ${error.message}${error.status ? ` (${error.status})` : ''}\n`)
      return 1
    }
    throw error
  }
}

interface SimulatorOptions {
  url?: string | undefined
  email?: string | undefined
  speed?: string | undefined
  wait?: boolean | undefined
}

function isZone(value: string | undefined): value is ZoneKind {
  return (ZONE_KINDS as readonly string[]).includes(value ?? '')
}

async function runSimulatorCommand(
  command: string,
  args: string[],
  values: SimulatorOptions,
  env: Record<string, string | undefined>,
  io: CliIo,
  deps: CliDeps,
): Promise<number> {
  if (command === 'scenarios') {
    for (const s of SCENARIOS) {
      io.out(
        `${s.id}\n  ${s.title} (약 ${scenarioDurationSeconds(s)}초)\n  ${s.description}\n  기대: ${s.expectation}\n`,
      )
    }
    return 0
  }

  // 입력을 먼저 확인해 잘못된 호출은 서버에 로그인하기 전에 거절한다.
  let speed: SimulatorSpeed = 1
  if (command === 'scenario') {
    if (!args[0] || !findScenario(args[0])) {
      io.err(`시나리오 id 가 필요합니다. 'scenarios' 로 목록을 확인해 주세요.\n`)
      return 2
    }
    const requested = values.speed === undefined ? 1 : Number(values.speed)
    if (!(SIMULATOR_SPEEDS as readonly number[]).includes(requested)) {
      io.err(`--speed 는 ${SIMULATOR_SPEEDS.join(', ')} 중 하나여야 합니다.\n`)
      return 2
    }
    speed = requested as SimulatorSpeed
  }
  if (command === 'motion' && !isZone(args[0])) {
    io.err(`zone 이 필요합니다: ${ZONE_KINDS.join(' | ')}\n`)
    return 2
  }
  if (command === 'fault' && args[0] !== 'on' && args[0] !== 'off') {
    io.err('fault 는 on 또는 off 와 함께 써 주세요.\n')
    return 2
  }

  if (command === 'demo' && args[0] !== 'reset' && args[0] !== 'status') {
    io.err('demo 는 reset 또는 status 와 함께 써 주세요.\n')
    return 2
  }

  const email = values.email ?? env.TETRIS_EMAIL
  const password = env.TETRIS_PASSWORD
  if (!email || !password) {
    io.err(
      '시뮬레이터 명령은 보호자 계정이 필요합니다. TETRIS_EMAIL(또는 --email)과 TETRIS_PASSWORD 환경변수를 지정해 주세요.\n',
    )
    return 2
  }

  const client = new DevClient({
    baseUrl: values.url ?? env.TETRIS_URL ?? 'http://127.0.0.1:4000',
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  })
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  try {
    await client.login(email, password)

    if (command === 'scenario') {
      const id = args[0] as string
      const started = await client.runScenario(id, speed)
      if (!started.night.isNightNow) {
        io.out(
          '주의: 지금은 야간 시간대가 아니어서 움직임 알림은 만들어지지 않고 기록만 남습니다.\n',
        )
      }
      io.out(`시나리오 "${id}" 재생을 시작했습니다. (${speed}배속)\n`)
      if (!values.wait) return 0
      let state = started
      while (state.running) {
        await sleep(1000)
        state = await client.state()
      }
      const last = state.lastRun
      if (last?.outcome === 'COMPLETED') {
        io.out('재생이 끝났습니다.\n')
        return 0
      }
      io.err(
        `재생이 끝까지 가지 못했습니다: ${last?.outcome ?? '알 수 없음'}${last?.error ? ` — ${last.error}` : ''}\n`,
      )
      return 1
    }
    if (command === 'motion') {
      await client.motion(args[0] as ZoneKind)
      io.out(`${args[0]} 구역에서 움직임을 보냈습니다.\n`)
      return 0
    }
    if (command === 'demo') {
      const counts = (c: { sensors: number; events: number; alerts: number }) =>
        `센서 ${c.sensors}, 기록 ${c.events}, 알림 ${c.alerts}`
      if (args[0] === 'reset') {
        const result = await client.deleteSimulatedData()
        io.out(`시뮬레이션 데이터를 지웠습니다. (${counts(result.deleted)})\n`)
        const state = await client.ensureSensors()
        const connected = state.sensors.filter((s) => s.sensor !== null).length
        io.out(`시뮬레이션 센서 ${connected}개를 연결했습니다. (첫 신호 전송)\n`)
      }
      const summary = await client.dataSummary()
      const state = await client.state()
      io.out(
        `시뮬레이션 데이터: ${counts(summary.simulated)}\n실제 데이터(건드리지 않음): ${counts(summary.real)}\n` +
          `지금은 ${state.night.isNightNow ? '알림을 판단하는 야간 시간대입니다.' : '야간 시간대가 아니라 움직임은 기록만 되고 알림은 만들어지지 않습니다. (시연 시나리오는 야간에 재생하세요)'}\n`,
      )
      return 0
    }
    if (command === 'fault') {
      const state = await client.setDeliveryFailure(args[0] === 'on')
      io.out(
        state.deliveryFailure.enabled
          ? `전달 실패 주입을 켰습니다. (${state.deliveryFailure.expiresAt} 에 자동으로 꺼집니다)\n`
          : '전달 실패 주입을 껐습니다.\n',
      )
      return 0
    }
    const result = await client.deleteSimulatedData()
    const d = result.deleted
    io.out(
      `시뮬레이션 데이터를 지웠습니다. (센서 ${d.sensors}, 기록 ${d.events}, 알림 ${d.alerts})\n`,
    )
    return 0
  } catch (error) {
    if (error instanceof DevApiError) {
      io.err(`실패: ${error.message}${error.status ? ` (${error.status})` : ''}\n`)
      return 1
    }
    throw error
  }
}
