import { ZONE_LABELS, type SensorKind, type ZoneKind } from '@tetris/shared'

/** 센서 등록 방식. 실제 장치와 시뮬레이션은 처음부터 갈라서, 가상의 센서가 실제 장치처럼 보이지 않게 한다. */
export type ConnectionMethod = 'DEVICE_TOKEN' | 'SIMULATOR'

export interface ConnectionOption {
  id: ConnectionMethod | 'DIRECT_RADIO'
  label: string
  description: string
  /** 지금 고를 수 있는가. 아니라면 이유를 reason 으로 밝힌다. */
  available: boolean
  reason?: string
}

/**
 * 연결 방식 선택지. 지원하지 않는 방식은 감추지 않고 "지원하지 않음"으로 보여 준다.
 * (없는 기능이 있는 것처럼 보이지도, 있는 기능을 못 찾지도 않게)
 */
export function connectionOptions(simulatorEnabled: boolean): ConnectionOption[] {
  return [
    {
      id: 'DEVICE_TOKEN',
      label: '장치 토큰으로 연결 (실제 센서)',
      description:
        '등록하면 장치 토큰을 한 번 알려 드립니다. 센서(또는 센서에 연결한 장치)가 이 토큰으로 서버에 움직임 신호를 보냅니다.',
      available: true,
    },
    {
      id: 'SIMULATOR',
      label: '시뮬레이션 센서 (개발·시연용)',
      description:
        '실제 장치 없이 화면과 알림을 확인하기 위한 가상의 센서입니다. 구역마다 하나씩 만들어지며 "시뮬레이션"으로 표시됩니다.',
      available: simulatorEnabled,
      reason: '서버에서 시뮬레이터가 꺼져 있어 쓸 수 없습니다.',
    },
    {
      id: 'DIRECT_RADIO',
      label: '블루투스·지그비 등으로 직접 연결',
      description: '센서와 무선으로 바로 짝을 맞추는 방식입니다.',
      available: false,
      reason: '아직 지원하지 않습니다.',
    },
  ]
}

export const DEVICE_STEPS = [
  '센서 유형',
  '연결 방식',
  '이름과 설치 위치',
  '장치 연결',
  '연결 확인',
] as const

export const SIMULATOR_STEPS = ['센서 유형', '연결 방식', '시뮬레이션 센서 만들기'] as const

export function stepsFor(method: ConnectionMethod | null): readonly string[] {
  return method === 'SIMULATOR' ? SIMULATOR_STEPS : DEVICE_STEPS
}

export interface SensorTypeOption {
  kind: SensorKind
  label: string
  description: string
}

/** 지금 지원하는 센서 유형은 움직임 감지 하나뿐이다. */
export const SENSOR_TYPES: readonly SensorTypeOption[] = [
  {
    kind: 'MOTION',
    label: '움직임 감지 센서',
    description: '사람의 움직임을 감지하면 신호를 보냅니다. 침대 주변·이동 경로·현관에 둡니다.',
  },
]

/** 구역을 고르면 이름 칸에 채워 줄 기본 이름. 직접 고쳐 쓴 이름은 덮어쓰지 않는다. */
export function defaultSensorName(zone: ZoneKind): string {
  return `${ZONE_LABELS[zone]} 센서`
}
