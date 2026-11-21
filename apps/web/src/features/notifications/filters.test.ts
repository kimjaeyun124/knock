import { describe, expect, it } from 'vitest'
import {
  alertFiltersToParams,
  isDefaultAlertFilters,
  parseAlertFilters,
  toAlertListFilter,
} from './filters'

const parse = (query = '') => parseAlertFilters(new URLSearchParams(query))

describe('알림 센터 조건', () => {
  it('아무것도 없으면 전체·모든 종류·모든 상태이다', () => {
    expect(parse()).toEqual({ view: 'all', type: '', status: '' })
    expect(isDefaultAlertFilters(parse())).toBe(true)
  })

  it('주소의 조건을 읽고 다시 주소로 만들면 같다', () => {
    const filters = parse('view=unread&type=SENSOR_OFFLINE&status=OPEN')
    expect(filters).toEqual({ view: 'unread', type: 'SENSOR_OFFLINE', status: 'OPEN' })
    expect(Object.fromEntries(alertFiltersToParams(filters))).toEqual({
      view: 'unread',
      type: 'SENSOR_OFFLINE',
      status: 'OPEN',
    })
  })

  it('올바르지 않은 값은 전체로 취급한다', () => {
    expect(parse('view=starred&type=FALL&status=DONE')).toEqual({
      view: 'all',
      type: '',
      status: '',
    })
  })

  it('서버 조건: 읽지 않음·중요는 각각의 필터가 되고, 조건이 없으면 보내지 않는다', () => {
    expect(toAlertListFilter(parse())).toEqual({ limit: 30 })
    expect(toAlertListFilter(parse('view=unread'))).toEqual({ limit: 30, unread: 'true' })
    expect(toAlertListFilter(parse('view=important&status=RESOLVED&type=LOW_BATTERY'))).toEqual({
      limit: 30,
      important: 'true',
      status: ['RESOLVED'],
      type: 'LOW_BATTERY',
    })
  })
})
