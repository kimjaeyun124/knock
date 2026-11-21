import { ZONE_LABELS, type ZoneKind } from './domain'

/**
 * 알림 문구. 서비스는 "움직임 신호"를 알리는 도구이며 낙상·배회를 확실히 감지하지 않는다.
 * 그래서 모든 문구는 "감지되었습니다 + 확인해 주세요" 형태로, 상황을 단정하지 않는다.
 * (docs/IMPLEMENTATION_PLAN.md 2.1, 문구 검사는 copy.test.ts)
 */

/** 알림·화면 문구에 쓰면 안 되는 단정적·의학적 표현 */
export const FORBIDDEN_PHRASES = [
  '낙상',
  '배회',
  '이탈',
  '안전합니다',
  '이상 없음',
  '예방',
  '사고',
  '진단',
  '확실',
] as const

export interface AlertText {
  title: string
  message: string
}

const quote = (name: string): string => `'${name}'`

/** 일부 신호가 발생보다 늦게 도착했을 때 덧붙이는 안내 */
export const LATE_NOTE = ' 일부 신호는 발생 후 늦게 도착했습니다.'

export const REMINDER_PREFIX = '[재알림] '

export const alertCopy = {
  /**
   * preceding: 현관 신호 직전 시간 창 안에 침대 주변·이동 경로에서도 신호가 있었다면 그 구역들.
   * 흐름을 알려 주는 정보일 뿐이며 외출·이동 방향을 단정하지 않는다.
   */
  entranceApproach(
    sensorName: string,
    preceding?: { windowMinutes: number; zones: readonly ZoneKind[] },
  ): AlertText {
    const context =
      preceding && preceding.zones.length > 0
        ? ` 직전 ${preceding.windowMinutes}분 안에 ${preceding.zones
            .map((zone) => ZONE_LABELS[zone])
            .join('·')} 구역에서도 움직임 신호가 있었습니다.`
        : ''
    return {
      title: '현관 근처에서 움직임이 감지되었습니다',
      message: `야간 시간대에 현관 센서(${sensorName})에서 움직임 신호가 있었습니다.${context} 확인해 주세요.`,
    }
  },

  bedAreaActivity(sensorName: string): AlertText {
    return {
      title: '침대 주변에서 움직임이 감지되었습니다',
      message: `야간 시간대에 침대 주변 센서(${sensorName})에서 움직임 신호가 있었습니다. 상황을 확인해 주세요.`,
    }
  },

  bedToPath(gapSeconds: number): AlertText {
    const minutes = Math.max(1, Math.round(gapSeconds / 60))
    return {
      title: '침대 주변에서 이동 경로로 움직임이 이어졌습니다',
      message: `침대 주변 센서 다음으로 이동 경로 센서에서 ${minutes}분 안에 움직임 신호가 있었습니다. 상황을 확인해 주세요.`,
    }
  },

  repeatedMovement(transitions: number, windowMinutes: number): AlertText {
    return {
      title: '짧은 시간 동안 여러 구역에서 움직임이 감지되었습니다',
      message: `${windowMinutes}분 안에 구역이 ${transitions}번 바뀌며 움직임 신호가 있었습니다. 상황을 확인해 주세요.`,
    }
  },

  sensorOffline(sensorName: string, zone: ZoneKind, silentMinutes: number): AlertText {
    return {
      title: `${quote(sensorName)} 센서의 연결이 끊겼습니다`,
      message: `${silentMinutes}분 이상 신호가 없습니다. 이 센서가 맡은 ${ZONE_LABELS[zone]} 구역의 움직임은 지금 확인되지 않습니다.`,
    }
  },

  /** 끊겼던 센서가 다시 연결되었을 때. 끊겨 있던 동안의 움직임은 기록되지 않았을 수 있다고 밝힌다. */
  sensorRestored(sensorName: string, zone: ZoneKind): AlertText {
    return {
      title: `${quote(sensorName)} 센서의 연결이 복구되었습니다`,
      message: `신호가 다시 들어오고 있습니다. 끊겨 있던 동안 이 센서가 맡은 ${ZONE_LABELS[zone]} 구역의 움직임은 기록되지 않았을 수 있습니다.`,
    }
  },

  lowBattery(sensorName: string, percent: number, critical: boolean): AlertText {
    return critical
      ? {
          title: `${quote(sensorName)} 센서의 배터리가 거의 없습니다 (${percent}%)`,
          message:
            '곧 꺼질 수 있습니다. 바로 교체하거나 충전해 주세요. 꺼지면 이 구역의 움직임을 확인할 수 없습니다.',
        }
      : {
          title: `${quote(sensorName)} 센서의 배터리가 부족합니다 (${percent}%)`,
          message: '배터리를 교체하거나 충전해 주세요.',
        }
  },

  deliveryFailed(failedAlertTitle: string): AlertText {
    return {
      title: '알림을 보호자에게 전달하지 못했습니다',
      message: `${quote(failedAlertTitle)} 알림을 어떤 방법으로도 전달하지 못했습니다. 앱을 열어 알림 목록을 확인해 주세요.`,
    }
  },
} as const
