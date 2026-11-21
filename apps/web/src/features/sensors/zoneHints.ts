import type { ZoneKind } from '@tetris/shared'

/** 센서를 어느 구역에 둘지 고르는 데 도움이 되는 설명 */
export const ZONE_HINTS: Record<ZoneKind, string> = {
  BED_SIDE: '침대 바로 옆. 침대에서 일어나는 움직임을 봅니다.',
  PATH: '침대에서 화장실·현관으로 이어지는 복도나 이동 경로.',
  ENTRANCE: '현관문 근처. 밖으로 나가는 방향의 움직임을 봅니다.',
}
