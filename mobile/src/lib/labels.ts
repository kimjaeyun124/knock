import type { AlertStatus, Severity, Zone } from './types'
import type { Tone } from '../theme'

export const ZONE_LABELS: Record<Zone, string> = {
  BED_SIDE: '침대 주변',
  PATH: '이동 경로',
  ENTRANCE: '현관',
}

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  URGENT: { label: '즉시 확인 권장', tone: 'danger' },
  NOTICE: { label: '확인 필요', tone: 'warn' },
  INFO: { label: '참고', tone: 'muted' },
}

export const STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: '진행 중',
  ACKNOWLEDGED: '확인함',
  RESOLVED: '종료함',
}

/** 화면 문구에 쓰면 안 되는 단정적·의학적 표현 (서버·웹과 같은 목록) */
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
