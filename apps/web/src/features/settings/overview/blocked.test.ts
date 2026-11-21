import { describe, expect, it } from 'vitest'
import { DEFAULT_ALERT_PREFERENCES, DEFAULT_DETECTION_SETTINGS } from '@tetris/shared'
import { makeSensor } from '@/test/fixtures'
import { dangerItems, describeBlockedAlerts } from './blocked'

const entrance = makeSensor({ id: 'e', zone: 'ENTRANCE' })
const bed = makeSensor({ id: 'b', zone: 'BED_SIDE' })
const path = makeSensor({ id: 'p', zone: 'PATH' })
const ALL = [entrance, bed, path]

const run = (
  detection: Partial<typeof DEFAULT_DETECTION_SETTINGS> = {},
  prefs: Partial<typeof DEFAULT_ALERT_PREFERENCES> = {},
  sensors = ALL,
) =>
  describeBlockedAlerts({
    detection: { ...DEFAULT_DETECTION_SETTINGS, ...detection },
    prefs: { ...DEFAULT_ALERT_PREFERENCES, ...prefs },
    sensors,
  })
const ids = (items: { id: string }[]) => items.map((i) => i.id)

describe('전달되지 않는 알림 안내', () => {
  it('기본 설정(보통 민감도, 센서 3개)에서는 침대 주변 움직임만 만들어지지 않는다고 참고로 알린다', () => {
    expect(ids(run())).toEqual(['bed-needs-high'])
    expect(run()[0]?.level).toBe('info')
  })

  it('민감도를 높음으로 하면 알릴 것이 없다', () => {
    expect(run({ sensitivity: 'HIGH' })).toEqual([])
  })

  it('모니터링을 끄면 위험이다: 현관 근처 움직임까지 전달되지 않는다고 밝힌다', () => {
    const items = run({ monitoringEnabled: false })
    expect(items[0]).toMatchObject({ id: 'monitoring-off', level: 'danger' })
    expect(items[0]?.title).toContain('움직임 알림이 모두')
    expect(items[0]?.detail).toContain('현관 근처 움직임')
    expect(items[0]?.detail).toContain('움직임 기록에 그대로 남습니다')
  })

  it('요일을 빼면 어느 요일의 밤인지 알리고, 절반 이상 빠지면 위험으로 본다', () => {
    const few = run({ activeWeekdays: [0, 1, 2, 3, 4, 5] }) // 일요일만 빠짐
    expect(few.find((i) => i.id === 'weekdays')).toMatchObject({ level: 'warn' })
    expect(few.find((i) => i.id === 'weekdays')?.title).toContain('일')
    const many = run({ activeWeekdays: [0] })
    expect(many.find((i) => i.id === 'weekdays')?.level).toBe('danger')
  })

  it('현관 알림을 끄면 위험, 다른 움직임 알림을 끄면 경고다', () => {
    expect(dangerItems(run({}, { entranceApproach: false })).map((i) => i.id)).toEqual([
      'pref-entranceApproach',
    ])
    const items = run({}, { bedToPath: false })
    expect(items.find((i) => i.id === 'pref-bedToPath')?.level).toBe('warn')
    expect(dangerItems(items)).toEqual([])
  })

  it('모니터링이 꺼져 있으면 종류별 끔을 따로 늘어놓지 않는다 (이미 모두 막혀 있다)', () => {
    const items = run({ monitoringEnabled: false }, { entranceApproach: false, bedToPath: false })
    expect(items.some((i) => i.id.startsWith('pref-'))).toBe(false)
  })

  it('센서 장애·배터리 알림을 끄면 무엇을 놓치는지, 그래도 남는 표시는 무엇인지 알린다', () => {
    const items = run({ sensitivity: 'HIGH' }, { sensorIssues: false, lowBattery: false })
    expect(ids(items)).toEqual(['sensor-issues', 'low-battery'])
    expect(items[0]?.detail).toContain('센서 화면과 대시보드에 계속 표시')
    expect(items[1]?.detail).toContain('센서 화면에 계속 표시')
  })

  it('현관 센서가 없거나 꺼져 있으면 현관 알림이 만들어질 수 없다고 알린다 (센서가 하나도 없을 때는 말하지 않는다)', () => {
    const withoutEntrance = run({ sensitivity: 'HIGH' }, {}, [bed, path])
    expect(ids(withoutEntrance)).toEqual(['no-entrance-sensor'])
    expect(run({ sensitivity: 'HIGH' }, {}, [])).toEqual([])
    const off = run({ sensitivity: 'HIGH' }, {}, [{ ...entrance, isActive: false }, bed, path])
    expect(ids(off)).toEqual(['no-entrance-sensor'])
  })

  it('센서별 민감도를 반영한다: 침대 센서만 높음으로 하면 침대 주변 알림이 만들어진다', () => {
    const items = run({}, {}, [entrance, { ...bed, sensitivity: 'HIGH' }, path])
    expect(ids(items)).toEqual([])
  })

  it('이동 경로 센서가 낮음이면 이어진 움직임 알림이 만들어지지 않는다고 알린다', () => {
    const items = run({ sensitivity: 'HIGH' }, {}, [entrance, bed, { ...path, sensitivity: 'LOW' }])
    expect(ids(items)).toEqual(['path-low'])
  })

  it('중복 알림 간격이 60분 이상이면 새 상황을 늦게 알 수 있다고 알린다', () => {
    const items = run({ sensitivity: 'HIGH', cooldownMinutes: 90 })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'cooldown', level: 'info' })
  })

  it('위험 → 경고 → 참고 순으로 정렬된다', () => {
    const items = run({ monitoringEnabled: true }, { entranceApproach: false, sensorIssues: false })
    const levels = items.map((i) => i.level)
    expect(levels).toEqual([...levels].sort((a, b) => 'dwi'.indexOf(a[0]!) - 'dwi'.indexOf(b[0]!)))
  })
})
