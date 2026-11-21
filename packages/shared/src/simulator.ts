import { z } from './zod'
import { SensorSchema } from './sensors'
import { SensitivitySchema, ZoneKindSchema } from './domain'

/** 시나리오 재생 배속. 단계 사이의 "기다리는 시간"만 줄어든다. (서버의 판단 기준 시간은 그대로) */
export const SIMULATOR_SPEEDS = [1, 10, 60] as const
export const SimulatorSpeedSchema = z.union([z.literal(1), z.literal(10), z.literal(60)])
export type SimulatorSpeed = z.infer<typeof SimulatorSpeedSchema>

/** 시나리오 한 단계가 하는 일 */
export const ScenarioActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('motion'), zone: ZoneKindSchema }),
  z.object({
    kind: z.literal('heartbeat'),
    zone: ZoneKindSchema,
    batteryPercent: z.number().int().min(0).max(100).optional(),
  }),
  /** 센서가 신호를 보내지 않게 한다. (연결 끊김 상황) */
  z.object({ kind: z.literal('silence'), zone: ZoneKindSchema }),
  /** 멈췄던 센서가 다시 신호를 보내게 한다. */
  z.object({ kind: z.literal('resume'), zone: ZoneKindSchema }),
  /** 시뮬레이션 알림의 앱 화면 전달을 실패시킨다. 실제 알림에는 영향이 없다. */
  z.object({ kind: z.literal('deliveryFailure'), enabled: z.boolean() }),
])
export type ScenarioAction = z.infer<typeof ScenarioActionSchema>

export const ScenarioStepSchema = z.object({
  /** 시나리오 시작 후 이 단계까지 기다리는 시간(초, 1배속 기준) */
  atSeconds: z.number().int().min(0),
  action: ScenarioActionSchema,
})
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>

export const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** 기대하는 결과. 민감도에 따라 달라지는 경우 함께 적는다. */
  expectation: z.string(),
  steps: z.array(ScenarioStepSchema).min(1),
})
export type Scenario = z.infer<typeof ScenarioSchema>

const motion = (atSeconds: number, zone: 'BED_SIDE' | 'PATH' | 'ENTRANCE'): ScenarioStep => ({
  atSeconds,
  action: { kind: 'motion', zone },
})

/**
 * 기본 시나리오 6종. 임계값을 조정할 때 같은 입력으로 결과를 비교하는 기준이 된다.
 * 야간 시간대 안에서 재생해야 움직임 알림이 만들어진다. (밖이면 기록만 남는다)
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'normal-night',
    title: '화장실에 다녀온 뒤 침대로 돌아옴',
    description: '침대 옆 → 이동 경로 → 침대 옆 순서로 움직임이 이어집니다.',
    expectation:
      '민감도 낮음: 알림 없음. 보통 이상: "확인 필요" 1건(침대 주변에서 이동 경로로 이어진 움직임). 긴급 알림은 없어야 합니다.',
    steps: [
      motion(0, 'BED_SIDE'),
      motion(60, 'PATH'),
      motion(180, 'PATH'),
      motion(300, 'BED_SIDE'),
    ],
  },
  {
    id: 'bed-to-path',
    title: '침대 주변에서 이동 경로로 이어진 움직임',
    description: '침대 옆에서 움직임이 있고 2분 뒤 이동 경로에서 움직임이 이어집니다.',
    expectation: '보통 이상: "확인 필요" 1건. 낮음: 알림 없음.',
    steps: [motion(0, 'BED_SIDE'), motion(120, 'PATH')],
  },
  {
    id: 'entrance',
    title: '현관 근처 움직임',
    description: '현관 센서에서 움직임이 감지됩니다.',
    expectation: '모든 민감도에서 "즉시 확인 권장" 1건.',
    steps: [motion(0, 'ENTRANCE')],
  },
  {
    id: 'repeated-movement',
    title: '짧은 시간 동안 여러 구역의 움직임',
    description: '침대 옆·이동 경로·현관을 번갈아 오가며 구역 전환이 반복됩니다.',
    expectation:
      '구역 전환이 기준 횟수(낮음 6 / 보통 4 / 높음 3)에 이르면 "확인 필요" 1건. 현관 신호가 있으므로 "즉시 확인 권장"도 함께 생깁니다.',
    steps: [
      motion(0, 'BED_SIDE'),
      motion(30, 'PATH'),
      motion(60, 'BED_SIDE'),
      motion(90, 'PATH'),
      motion(120, 'ENTRANCE'),
      motion(150, 'PATH'),
      motion(180, 'BED_SIDE'),
    ],
  },
  {
    id: 'sensor-trouble',
    title: '센서 배터리 소진과 연결 끊김',
    description: '침대 옆 센서의 배터리가 25% → 18% → 9%로 줄고, 이후 신호를 보내지 않습니다.',
    expectation:
      '배터리 18%: 참고(부족), 9%: 확인 필요(위급). 신호가 끊긴 뒤 설정한 시간(기본 5분)이 지나면 "연결 끊김"이 생깁니다. 끊김은 화면의 "연결 복구" 버튼으로 풀 수 있습니다.',
    steps: [
      { atSeconds: 0, action: { kind: 'heartbeat', zone: 'BED_SIDE', batteryPercent: 25 } },
      { atSeconds: 10, action: { kind: 'heartbeat', zone: 'BED_SIDE', batteryPercent: 18 } },
      { atSeconds: 20, action: { kind: 'heartbeat', zone: 'BED_SIDE', batteryPercent: 9 } },
      { atSeconds: 30, action: { kind: 'silence', zone: 'BED_SIDE' } },
    ],
  },
  {
    id: 'delivery-failure',
    title: '알림 전달 실패',
    description: '앱 화면 알림의 전달을 실패시킨 채 현관 움직임을 보냅니다.',
    expectation:
      '"즉시 확인 권장" 알림의 전달이 3번 실패하면(약 2분 30초) "알림을 전달하지 못했습니다" 알림이 생기고 상단 띠에 전달 실패가 표시됩니다. 주입은 10분 뒤 자동으로 꺼지며, 화면에서 바로 끌 수도 있습니다.',
    steps: [
      { atSeconds: 0, action: { kind: 'deliveryFailure', enabled: true } },
      motion(1, 'ENTRANCE'),
    ],
  },
]

export const ScenarioIdSchema = z.enum(SCENARIOS.map((s) => s.id) as [string, ...string[]])

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id)
}

/** 시나리오의 전체 길이(초, 1배속) */
export function scenarioDurationSeconds(scenario: Scenario): number {
  return Math.max(...scenario.steps.map((step) => step.atSeconds))
}

// ───────── API 계약 (서버: SIMULATOR_ENABLED 일 때만 /api/dev/simulator 아래에 등록) ─────────

export const SimulatorSensorSchema = z.object({
  zone: ZoneKindSchema,
  /** 아직 만들지 않았으면 null */
  sensor: SensorSchema.nullable(),
  /** 신호를 보내지 않도록 멈춘 상태 */
  silenced: z.boolean(),
  /** 시뮬레이터가 heartbeat 로 보내는 배터리 값 */
  batteryPercent: z.number().int().nullable(),
})

export const SimulatorRunSchema = z.object({
  scenarioId: z.string(),
  speed: SimulatorSpeedSchema,
  startedAt: z.iso.datetime(),
  /** 지금까지 보낸 단계 수 */
  completedSteps: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive(),
})

/** 전송 한 건에 대한 수집 API 의 응답 */
export const SimulatorSendRequestResultSchema = z.object({
  eventId: z.string().nullable(),
  /** ACCEPTED 저장됨 · DUPLICATE 이미 받은 이벤트라 저장하지 않음 · REJECTED 거부됨 · OK 신호(heartbeat) 수신 */
  status: z.enum(['ACCEPTED', 'DUPLICATE', 'REJECTED', 'OK']),
  reason: z.string().nullable(),
})

/** 시뮬레이터가 수집 API 로 보낸 전송 한 번의 결과. (서버 메모리에만 보관하는 최근 기록) */
export const SimulatorSendResultSchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  zone: ZoneKindSchema,
  sensorName: z.string().nullable(),
  /** 사람이 읽는 전송 내용. 예: "움직임 1건", "움직임 2건 (중복 전송)" */
  label: z.string(),
  /** 수집 API 가 받아 처리했는가 (거부·오류면 false) */
  ok: z.boolean(),
  requests: z.array(SimulatorSendRequestResultSchema),
  /** 이 전송 뒤에 새로 만들어진 알림 */
  newAlerts: z.array(
    z.object({ id: z.string(), type: z.string(), severity: z.string(), title: z.string() }),
  ),
  /** 신호에 실은 발생 시각. 서버 시각을 쓰면 null */
  occurredAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
})
export type SimulatorSendResult = z.infer<typeof SimulatorSendResultSchema>

export const SimulatorStateSchema = z.object({
  sensors: z.array(SimulatorSensorSchema),
  /** 최근 전송 기록(최신순, 최대 30건) */
  recent: z.array(SimulatorSendResultSchema).default([]),
  running: SimulatorRunSchema.nullable(),
  /** 마지막으로 끝났거나 멈춘 시나리오 */
  lastRun: z
    .object({
      scenarioId: z.string(),
      endedAt: z.iso.datetime(),
      outcome: z.enum(['COMPLETED', 'STOPPED', 'FAILED']),
      error: z.string().nullable(),
    })
    .nullable(),
  deliveryFailure: z.object({
    enabled: z.boolean(),
    /** 자동으로 꺼지는 시각 */
    expiresAt: z.iso.datetime().nullable(),
  }),
  /** 지금이 야간 시간대인가. 아니면 움직임 알림이 만들어지지 않는다. */
  night: z.object({
    start: z.string(),
    end: z.string(),
    isNightNow: z.boolean(),
    sensitivity: SensitivitySchema,
  }),
})
export type SimulatorState = z.infer<typeof SimulatorStateSchema>

/**
 * 움직임 전송 방식.
 *  single    한 건
 *  burst     같은 구역에서 count 건을 한 번에 (반복 감지 테스트)
 *  duplicate 같은 이벤트 ID 를 두 번 보낸다 (재전송·중복 방지 테스트): 첫 번째 ACCEPTED, 두 번째 DUPLICATE 여야 한다
 *  invalid   25시간 전에 발생한 것으로 보낸다. 서버는 거부(REJECTED)하고 센서의 "데이터 수신 오류"로 기록해야 한다
 */
export const SIMULATOR_MOTION_MODES = ['single', 'burst', 'duplicate', 'invalid'] as const
/** 발생 시각: now 지금 / night 가장 최근의 야간(모니터링) 시간대. 낮에도 야간 규칙을 시험할 수 있다. */
export const SIMULATOR_MOTION_WHEN = ['now', 'night'] as const

export const SimulatorMotionRequestSchema = z.object({
  zone: ZoneKindSchema,
  mode: z.enum(SIMULATOR_MOTION_MODES).default('single'),
  /** burst 일 때 건수 (2~20) */
  count: z.number().int().min(2).max(20).optional(),
  when: z.enum(SIMULATOR_MOTION_WHEN).default('now'),
})
export type SimulatorMotionRequest = z.input<typeof SimulatorMotionRequestSchema>

/** 센서를 만들 구역. 구역을 주지 않으면 세 구역 모두 */
export const SimulatorEnsureRequestSchema = z.object({ zone: ZoneKindSchema.optional() })
export const SimulatorBatteryRequestSchema = z.object({
  zone: ZoneKindSchema,
  batteryPercent: z.number().int().min(0).max(100),
})
export const SimulatorSilenceRequestSchema = z.object({
  zone: ZoneKindSchema,
  silenced: z.boolean(),
  /**
   * true 면 "신호가 오래 없었던 것처럼" 마지막 신호 시각을 설정한 끊김 기준 뒤로 돌리고 연결 점검을 바로 실행한다.
   * (기다리지 않고 연결 끊김 알림을 보기 위한 시연용 단축이다. 점검·알림 생성은 실제 처리 경로를 그대로 쓴다.)
   */
  fastForward: z.boolean().optional(),
})
export const SimulatorFaultRequestSchema = z.object({ deliveryFailure: z.boolean() })
export const SimulatorRunRequestSchema = z.object({ speed: SimulatorSpeedSchema.default(1) })
export type SimulatorRunRequest = z.input<typeof SimulatorRunRequestSchema>

/** GET /api/system/features */
export const FeaturesResponseSchema = z.object({ simulatorEnabled: z.boolean() })
export type FeaturesResponse = z.infer<typeof FeaturesResponseSchema>

// ───────── 시뮬레이션 데이터 관리 (GET /api/data/summary, DELETE /api/data/simulated) ─────────

export const DataSummaryResponseSchema = z.object({
  simulated: z.object({
    sensors: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    alerts: z.number().int().nonnegative(),
  }),
  real: z.object({
    sensors: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    alerts: z.number().int().nonnegative(),
  }),
})
export type DataSummaryResponse = z.infer<typeof DataSummaryResponseSchema>

export const DeleteSimulatedResponseSchema = z.object({
  ok: z.literal(true),
  deleted: z.object({
    sensors: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    alerts: z.number().int().nonnegative(),
  }),
})
export type DeleteSimulatedResponse = z.infer<typeof DeleteSimulatedResponseSchema>
