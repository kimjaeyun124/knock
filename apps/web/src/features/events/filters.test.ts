import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PERIOD,
  filtersToParams,
  isDefaultFilters,
  matchPreset,
  parseFilters,
  presetRange,
  rangeError,
  toTimelineFilter,
  toTimelineQuery,
} from './filters'

const TODAY = '2026-11-17'
const parse = (query = '') => parseFilters(new URLSearchParams(query), TODAY)

describe('조회 기간', () => {
  it('빠른 선택은 오늘을 포함한 N일이다', () => {
    expect(presetRange('today', TODAY)).toEqual({ from: '2026-11-17', to: '2026-11-17' })
    expect(presetRange('week', TODAY)).toEqual({ from: '2026-11-11', to: '2026-11-17' })
    expect(presetRange('month', TODAY)).toEqual({ from: '2026-10-19', to: '2026-11-17' })
  })
  it('현재 기간이 빠른 선택과 같은지 알아낸다 (직접 정한 기간은 null)', () => {
    expect(matchPreset(presetRange('week', TODAY), TODAY)).toBe('week')
    expect(matchPreset({ from: '2026-11-01', to: '2026-11-17' }, TODAY)).toBeNull()
  })
})

describe('주소 쿼리 ↔ 조건', () => {
  it('아무것도 없으면 최근 7일·전체·최신순이다', () => {
    expect(parse()).toEqual({
      ...presetRange(DEFAULT_PERIOD, TODAY),
      sensorId: '',
      type: '',
      attention: '',
      alert: '',
      order: 'desc',
    })
    expect(isDefaultFilters(parse(), TODAY)).toBe(true)
  })

  it('쿼리의 조건을 읽고, 다시 쿼리로 만들면 같다', () => {
    const query =
      'from=2026-11-01&to=2026-11-10&sensor=s1&type=BED_EXIT_CANDIDATE&attention=NOTICE&alert=true&order=asc'
    const filters = parse(query)
    expect(filters).toEqual({
      from: '2026-11-01',
      to: '2026-11-10',
      sensorId: 's1',
      type: 'BED_EXIT_CANDIDATE',
      attention: 'NOTICE',
      alert: 'true',
      order: 'asc',
    })
    expect(Object.fromEntries(filtersToParams(filters, TODAY))).toEqual({
      from: '2026-11-01',
      to: '2026-11-10',
      sensor: 's1',
      type: 'BED_EXIT_CANDIDATE',
      attention: 'NOTICE',
      alert: 'true',
      order: 'asc',
    })
  })

  it('올바르지 않은 값은 전체(기본)로 취급한다', () => {
    const filters = parse(
      'from=어제&to=2026-02-30&type=FALL&attention=HIGH&alert=maybe&order=random',
    )
    expect(filters).toMatchObject({ type: '', attention: '', alert: '', order: 'desc' })
    expect(filters.from).toBe('2026-11-11')
    expect(filters.to).toBe('2026-11-17')
  })

  it('기본값과 같은 항목은 주소에 넣지 않는다', () => {
    expect(filtersToParams(parse(), TODAY).toString()).toBe('')
    expect(isDefaultFilters({ ...parse(), type: 'LOW_BATTERY' }, TODAY)).toBe(false)
  })
})

describe('서버 조회 조건', () => {
  it('날짜를 로컬 하루의 시작·끝(ISO)으로 바꾸고, 비어 있는 조건은 보내지 않는다', () => {
    expect(toTimelineFilter({ ...parse('from=2026-11-14&to=2026-11-14') })).toEqual({
      from: '2026-11-13T15:00:00.000Z',
      to: '2026-11-14T14:59:59.999Z',
    })
  })
  it('조건·정렬·한 쪽 크기를 함께 담는다', () => {
    expect(
      toTimelineQuery(
        parse('from=2026-11-14&to=2026-11-14&type=LOW_BATTERY&alert=false&order=asc'),
      ),
    ).toEqual({
      from: '2026-11-13T15:00:00.000Z',
      to: '2026-11-14T14:59:59.999Z',
      type: 'LOW_BATTERY',
      alert: 'false',
      order: 'asc',
      limit: 30,
    })
  })
  it('시작 날짜가 종료 날짜보다 늦으면 이유를 알린다', () => {
    expect(rangeError({ from: '2026-11-17', to: '2026-11-10' })).toMatch(
      /시작 날짜가 종료 날짜보다 늦습니다/,
    )
    expect(rangeError({ from: '2026-11-10', to: '2026-11-10' })).toBeNull()
  })
})
