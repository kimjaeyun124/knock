import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { QueryState, type QueryLike } from './QueryState'

function query(overrides: Partial<QueryLike<string[]>>): QueryLike<string[]> {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}
const list = (items: string[]) => (
  <ul>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)

describe('QueryState', () => {
  it('불러오는 중에는 안내를 보여 준다', () => {
    render(<QueryState query={query({ isPending: true })}>{list}</QueryState>)
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중')
  })

  it('성공하면 데이터를 그린다 (빈 목록도 그대로 전달한다)', () => {
    render(<QueryState query={query({ data: ['가', '나'] })}>{list}</QueryState>)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('실패하면 메시지와 요청 번호를 보여 주고 다시 시도할 수 있다', async () => {
    const refetch = vi.fn()
    const error = new ApiError({
      kind: 'http',
      status: 500,
      message: '서버에서 문제가 발생했습니다.',
      requestId: 'req-123',
    })
    render(
      <QueryState
        query={query({ isError: true, error, refetch })}
        errorTitle="목록을 불러오지 못했습니다"
      >
        {list}
      </QueryState>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('목록을 불러오지 못했습니다')
    expect(screen.getByText('서버에서 문제가 발생했습니다.')).toBeInTheDocument()
    expect(screen.getByText(/req-123/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('최근 요청이 실패했다면 이전에 받아 둔 데이터가 있어도 보여 주지 않는다', () => {
    const error = new ApiError({ kind: 'network', message: '서버에 연결할 수 없습니다.' })
    render(
      <QueryState query={query({ data: ['오래된 데이터'], isError: true, error })}>
        {list}
      </QueryState>,
    )
    expect(screen.queryByText('오래된 데이터')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('서버가 아직 제공하지 않는 기능은 오류가 아니라 "아직 구현되지 않은 기능"으로 알린다', () => {
    const error = new ApiError({
      kind: 'not-implemented',
      message: '연동 현황 기능은 아직 서버에서 제공되지 않습니다.',
    })
    render(<QueryState query={query({ isError: true, error })}>{list}</QueryState>)
    expect(screen.getByText('아직 구현되지 않은 기능')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })
})
