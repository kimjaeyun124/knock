import {
  REPEATED_MIN_GAP_SECONDS,
  REPEATED_THRESHOLD,
  REPEATED_WINDOW_MINUTES,
  LATE_NOTE,
  alertCopy,
  severityRank,
  type DataOrigin,
  type Sensitivity,
} from '@tetris/shared'
import { isMonitoredTime } from '../time'
import { classifyMovementEvent } from './classify'
import type { AlertCandidate, RuleEvent } from './types'

export { REPEATED_MIN_GAP_SECONDS, REPEATED_THRESHOLD, REPEATED_WINDOW_MINUTES }

export interface MovementRuleSettings {
  monitoringEnabled: boolean
  activeWeekdays: readonly number[]
  nightStart: string
  nightEnd: string
  sensitivity: Sensitivity
  /** 침대 주변 → 이동 경로를 하나의 흐름으로 볼 시간 창 */
  sequenceWindowMinutes: number
}

export interface MovementRuleInput {
  /** 이번에 새로 저장된 이벤트 */
  newEvents: RuleEvent[]
  /** 판단에 쓸 최근 이벤트(새 이벤트 포함). 같은 출처(실제/시뮬레이션)끼리만 넣는다. */
  recentEvents: RuleEvent[]
  settings: MovementRuleSettings
  origin: DataOrigin
}

const byTime = (a: RuleEvent, b: RuleEvent): number =>
  a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id)

/**
 * 움직임 신호에서 알림 후보를 만든다. (계획서 10절)
 *
 * | 규칙 | 조건 | 심각도 |
 * (모든 규칙은 모니터링이 켜져 있고, 일정(요일·야간 시간)에 든 신호에만 적용된다. 민감도는 센서별 설정이 있으면 그것을 쓴다.)
 * 흐름 판단(침대→이동 경로, 구역 전환 횟수, 현관 직전 움직임)에는 **사용 중인 센서의, 모니터링 시간에 발생한 신호만** 쓴다.
 * 구역 전환은 직전 신호와 REPEATED_MIN_GAP_SECONDS 이상 떨어져야 센다. (이웃 센서의 감지 범위가 겹쳐 번갈아 반응하는 잡음을 이동으로 세지 않기 위함)
 * | ENTRANCE_APPROACH | 야간 + 현관 | 긴급 (모든 민감도). 직전 시간 창 안에 침대 주변·이동 경로 신호가 있었다면 문구에 알리고 근거에 함께 담는다(심각도는 그대로) |
 * | BED_AREA_ACTIVITY | 야간 + 침대 주변, 민감도 높음일 때만 | 주의 |
 * | BED_TO_PATH | 야간 + 이동 경로, 직전 시간 창 안에 침대 주변 신호, 민감도 보통 이상 | 주의 |
 * | REPEATED_MOVEMENT | 야간 + 30분 안에 구역이 N번 바뀜 (낮음 6 / 보통 4 / 높음 3) | 주의 |
 *
 * 야간 여부는 "신호가 발생한 시각"으로 판단한다. (늦게 도착한 신호도 발생 시각 기준)
 * 어떤 규칙도 한 번의 신호로 사고나 상태를 단정하지 않는다. 문구는 "감지됨 + 확인 요청"뿐이다.
 */
export function evaluateMovementRules(input: MovementRuleInput): AlertCandidate[] {
  const { settings, origin } = input
  const recent = [...input.recentEvents].sort(byTime)
  // 흐름 판단에 쓸 신호: 사용 중인 센서의 것이면서 모니터링 시간에 발생한 것만.
  // (꺼 둔 센서의 신호나 야간이 시작되기 전의 신호가 이동·반복 판단에 섞이지 않게 한다)
  const flow = recent.filter(
    (e) => (e.sensorEnabled ?? true) && isMonitoredTime(e.occurredAt, settings),
  )
  const candidates: AlertCandidate[] = []

  for (const event of [...input.newEvents].sort(byTime)) {
    // 분류·알림 후보 판단은 classify.ts 한 곳에서 한다. (모니터링 시간 밖이거나 꺼진 센서는 알림 후보가 아니다)
    const classification = classifyMovementEvent({
      zone: event.zone,
      occurredAt: event.occurredAt,
      schedule: settings,
      sensorEnabled: event.sensorEnabled ?? true,
      ...(event.connection ? { connection: event.connection } : {}),
    })
    if (!classification.alertEligible) continue
    // 센서마다 정한 민감도가 있으면 그것을, 없으면 가구 기본 민감도를 따른다.
    const sensitivity = event.sensitivity ?? settings.sensitivity
    const at = event.occurredAt.getTime()
    const base = {
      origin,
      sensorId: event.sensorId,
      triggeredAt: event.occurredAt,
      lastEventAt: event.occurredAt,
      mode: 'EVENT' as const,
    }

    if (event.zone === 'ENTRANCE') {
      // 직전 시간 창 안의 침대 주변·이동 경로 신호: 흐름을 알려 주는 정보일 뿐, 외출을 단정하지 않는다.
      const windowMs = settings.sequenceWindowMinutes * 60_000
      const preceding = flow.filter(
        (e) =>
          (e.zone === 'BED_SIDE' || e.zone === 'PATH') &&
          e.occurredAt.getTime() <= at &&
          at - e.occurredAt.getTime() <= windowMs,
      )
      const zones = (['BED_SIDE', 'PATH'] as const).filter((zone) =>
        preceding.some((e) => e.zone === zone),
      )
      candidates.push({
        ...base,
        type: 'ENTRANCE_APPROACH',
        severity: 'URGENT',
        dedupeKey: `ENTRANCE_APPROACH:${event.sensorId}`,
        ...alertCopy.entranceApproach(event.sensorName, {
          windowMinutes: settings.sequenceWindowMinutes,
          zones,
        }),
        evidenceEventIds: [...preceding.map((e) => e.id), event.id],
      })
    }

    if (event.zone === 'BED_SIDE' && sensitivity === 'HIGH') {
      candidates.push({
        ...base,
        type: 'BED_AREA_ACTIVITY',
        severity: 'NOTICE',
        dedupeKey: `BED_AREA_ACTIVITY:${event.sensorId}`,
        ...alertCopy.bedAreaActivity(event.sensorName),
        evidenceEventIds: [event.id],
      })
    }

    if (event.zone === 'PATH' && sensitivity !== 'LOW') {
      const windowMs = settings.sequenceWindowMinutes * 60_000
      const prior = flow
        .filter(
          (e) =>
            e.zone === 'BED_SIDE' &&
            e.occurredAt.getTime() <= at &&
            at - e.occurredAt.getTime() <= windowMs,
        )
        .at(-1)
      if (prior) {
        candidates.push({
          ...base,
          type: 'BED_TO_PATH',
          severity: 'NOTICE',
          dedupeKey: `BED_TO_PATH:${event.sensorId}`,
          ...alertCopy.bedToPath((at - prior.occurredAt.getTime()) / 1000),
          triggeredAt: prior.occurredAt,
          evidenceEventIds: [prior.id, event.id],
        })
      }
    }

    const windowEvents = flow.filter(
      (e) =>
        e.occurredAt.getTime() <= at &&
        e.occurredAt.getTime() > at - REPEATED_WINDOW_MINUTES * 60_000,
    )
    const transitions = countZoneTransitions(windowEvents)
    if (transitions >= REPEATED_THRESHOLD[sensitivity]) {
      candidates.push({
        ...base,
        type: 'REPEATED_MOVEMENT',
        severity: 'NOTICE',
        dedupeKey: 'REPEATED_MOVEMENT',
        ...alertCopy.repeatedMovement(transitions, REPEATED_WINDOW_MINUTES),
        triggeredAt: windowEvents[0]?.occurredAt ?? event.occurredAt,
        evidenceEventIds: windowEvents.map((e) => e.id),
      })
    }
  }

  return withLateNote(mergeCandidates(candidates), recent)
}

/**
 * 구역이 바뀐 횟수. 직전 신호와 REPEATED_MIN_GAP_SECONDS 이상 떨어져서 구역이 달라진 경우만 센다.
 * 이웃한 두 센서의 감지 범위가 겹쳐 몇 초 사이로 번갈아 반응하는 것은 사람이 오간 것이 아니라 한 번의 움직임에 대한
 * 겹친 반응일 수 있어 세지 않는다. (아무리 오래 이어져도 간격이 짧으면 세지 않는다)
 * 한계: 구역 사이를 정말로 몇 초 만에 오가는 경우(아주 좁은 집)는 이 규칙으로는 세지 못한다. 이때도 침대→이동 경로 규칙은 그대로 동작한다.
 */
export function countZoneTransitions(events: readonly RuleEvent[]): number {
  let count = 0
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1]
    const cur = events[i]
    if (!prev || !cur || prev.zone === cur.zone) continue
    if (cur.occurredAt.getTime() - prev.occurredAt.getTime() >= REPEATED_MIN_GAP_SECONDS * 1000) {
      count += 1
    }
  }
  return count
}

/**
 * 같은 종류(dedupeKey)의 후보를 하나로 합친다. 한 번에 여러 신호가 들어와도 알림은 종류당 하나다.
 * 심각도는 가장 높은 것, 문구는 가장 높은 심각도(같으면 가장 나중) 후보의 것을 쓴다.
 */
export function mergeCandidates(candidates: AlertCandidate[]): AlertCandidate[] {
  const merged = new Map<string, AlertCandidate>()
  for (const candidate of candidates) {
    const existing = merged.get(candidate.dedupeKey)
    if (!existing) {
      merged.set(candidate.dedupeKey, {
        ...candidate,
        evidenceEventIds: [...candidate.evidenceEventIds],
      })
      continue
    }
    const evidence = [...new Set([...existing.evidenceEventIds, ...candidate.evidenceEventIds])]
    const useNewText = severityRank(candidate.severity) >= severityRank(existing.severity)
    merged.set(candidate.dedupeKey, {
      ...(useNewText ? candidate : existing),
      severity:
        severityRank(candidate.severity) > severityRank(existing.severity)
          ? candidate.severity
          : existing.severity,
      triggeredAt: new Date(
        Math.min(existing.triggeredAt.getTime(), candidate.triggeredAt.getTime()),
      ),
      lastEventAt: new Date(
        Math.max(existing.lastEventAt.getTime(), candidate.lastEventAt.getTime()),
      ),
      evidenceEventIds: evidence,
    })
  }
  return [...merged.values()]
}

/** 근거 신호 중 늦게 도착한 것이 있으면 그 사실을 문구에 알린다. */
function withLateNote(candidates: AlertCandidate[], recent: RuleEvent[]): AlertCandidate[] {
  const late = new Set(recent.filter((e) => e.isLate).map((e) => e.id))
  return candidates.map((candidate) =>
    candidate.evidenceEventIds.some((id) => late.has(id))
      ? { ...candidate, message: candidate.message + LATE_NOTE }
      : candidate,
  )
}
