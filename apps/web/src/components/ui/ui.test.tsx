import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from './Badge'
import { Button } from './Button'
import { buttonStyles } from './buttonStyles'
import { Callout } from './Callout'
import { Card } from './Card'
import { AlertDialog, Dialog } from './Dialog'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { SelectField, TextField } from './fields'
import { IconButton } from './IconButton'
import { PageHeader } from './PageHeader'
import { SectionHeader } from './SectionHeader'
import { Sheet } from './Sheet'
import { Skeleton, SkeletonText } from './Skeleton'
import { Slider } from './Slider'
import { StatusBadge } from './StatusBadge'
import { StatusIndicator } from './StatusIndicator'
import { Switch } from './Switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'
import { ToastProvider, useToast } from './Toast'
import { Tooltip } from './Tooltip'

describe('Button', () => {
  it('크기마다 터치 영역(높이 44px 이상)을 확보한다', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      expect(buttonStyles({ size })).toMatch(/min-h-(11|12|14)/)
    }
  })

  it('종류와 크기에 따라 모양이 달라진다', () => {
    render(
      <>
        <Button variant="danger">삭제</Button>
        <Button variant="secondary" size="lg">
          취소
        </Button>
      </>,
    )
    expect(screen.getByRole('button', { name: '삭제' })).toHaveClass('bg-status-danger')
    expect(screen.getByRole('button', { name: '취소' })).toHaveClass('min-h-14')
  })

  it('처리 중에는 눌리지 않고 aria-busy 로 알리며, 글자를 바꿀 수 있다', async () => {
    const onClick = vi.fn()
    render(
      <Button loading loadingText="저장하는 중" onClick={onClick}>
        저장
      </Button>,
    )
    const button = screen.getByRole('button', { name: '저장하는 중' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('기본 type 은 button 이라 폼을 실수로 제출하지 않는다', () => {
    render(<Button>확인</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})

describe('IconButton', () => {
  it('이름(label)이 스크린리더용 이름이 되고 아이콘은 숨겨진다', () => {
    render(<IconButton icon={Plus} label="센서 추가" />)
    const button = screen.getByRole('button', { name: '센서 추가' })
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(button).toHaveClass('size-12')
  })
})

describe('상태 표시', () => {
  it('StatusBadge 는 색뿐 아니라 글자와 아이콘으로도 상태를 전한다', () => {
    render(<StatusBadge tone="danger">바로 확인해 주세요</StatusBadge>)
    const text = screen.getByText('바로 확인해 주세요')
    expect(text.parentElement?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('StatusIndicator 는 live 일 때만 role=status 이다', () => {
    const { rerender } = render(<StatusIndicator tone="ok" label="모니터링 중" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<StatusIndicator tone="ok" label="모니터링 중" live />)
    expect(screen.getByRole('status')).toHaveTextContent('모니터링 중')
  })

  it('Badge·Callout 은 글자를 그대로 보여 준다', () => {
    render(
      <>
        <Badge variant="brand">시뮬레이션</Badge>
        <Callout tone="warn" title="배터리가 낮습니다">
          <p>곧 교체해 주세요.</p>
        </Callout>
      </>,
    )
    expect(screen.getByText('시뮬레이션')).toBeInTheDocument()
    expect(screen.getByText('배터리가 낮습니다')).toBeInTheDocument()
  })
})

describe('제목', () => {
  it('PageHeader 는 h1, SectionHeader·Card 는 지정한 단계의 제목을 만든다', () => {
    render(
      <>
        <PageHeader title="알림" description="설명" actions={<button type="button">추가</button>} />
        <SectionHeader title="구역" level={3} />
        <Card title="카드" headingLevel={4}>
          내용
        </Card>
      </>,
    )
    expect(screen.getByRole('heading', { level: 1, name: '알림' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '구역' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: '카드' })).toBeInTheDocument()
  })
})

describe('입력', () => {
  it('TextField 는 이름표·도움말·오류 문구를 입력 칸에 연결한다', () => {
    render(<TextField label="이메일" hint="예: a@b.com" error="이메일 형식이 아닙니다." />)
    const input = screen.getByLabelText('이메일')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('예: a@b.com 이메일 형식이 아닙니다.')
    // 오류는 색이 아니라 글자로 말하고, 스크린리더가 바로 읽는다.
    expect(screen.getByRole('alert')).toHaveTextContent('이메일 형식이 아닙니다.')
  })

  it('오류가 없으면 aria-invalid 를 붙이지 않는다', () => {
    render(<TextField label="이름" />)
    expect(screen.getByLabelText('이름')).not.toHaveAttribute('aria-invalid')
  })

  it('SelectField 는 선택을 바꿀 수 있다', async () => {
    render(
      <SelectField label="구역" defaultValue="a">
        <option value="a">거실</option>
        <option value="b">침실</option>
      </SelectField>,
    )
    await userEvent.selectOptions(screen.getByLabelText('구역'), 'b')
    expect(screen.getByLabelText('구역')).toHaveValue('b')
  })

  it('Switch 는 이름표로 켜지고, 상태를 글자로도 보여 준다', async () => {
    const onChange = vi.fn()
    render(<Switch label="알림 소리" description="소리를 냅니다." onCheckedChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: /알림 소리/ })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveAccessibleDescription('소리를 냅니다.')
    expect(screen.getByText('꺼짐')).toBeInTheDocument()
    await userEvent.click(screen.getByText('알림 소리'))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('켜짐')).toBeInTheDocument()
  })

  it('Slider 는 키보드로 조절되고 값을 글자(aria-valuetext)로 읽어 준다', async () => {
    const onChange = vi.fn()
    render(
      <Slider
        label="알릴 시간"
        min={5}
        max={60}
        step={5}
        defaultValue={30}
        onValueChange={onChange}
        formatValue={(value) => `${value}분`}
      />,
    )
    const slider = screen.getByRole('slider', { name: '알릴 시간' })
    expect(slider).toHaveAttribute('aria-valuetext', '30분')
    act(() => {
      slider.focus()
    })
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(35)
    expect(slider).toHaveAttribute('aria-valuetext', '35분')
  })
})

function DialogDemo({ alert = false }: { alert?: boolean }) {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        열기
      </button>
      {confirmed ? <p>삭제됨</p> : null}
      {alert ? (
        <AlertDialog
          open={open}
          onOpenChange={setOpen}
          title="삭제할까요?"
          description="되돌릴 수 없습니다."
          confirmLabel="삭제"
          tone="danger"
          onConfirm={() => {
            setConfirmed(true)
            setOpen(false)
          }}
        />
      ) : (
        <Dialog open={open} onOpenChange={setOpen} title="이름 바꾸기" description="설명입니다.">
          <input aria-label="이름" />
        </Dialog>
      )}
    </>
  )
}

describe('Dialog', () => {
  it('열려 있을 때만 내용을 보여 주고, 제목·설명이 이름과 설명이 된다', async () => {
    render(<DialogDemo />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    const dialog = screen.getByRole('dialog', { name: '이름 바꾸기' })
    expect(dialog).toHaveAccessibleDescription('설명입니다.')
    expect(within(dialog).getByLabelText('이름')).toBeInTheDocument()
  })

  it('닫기 버튼과 Esc 로 닫힌다', async () => {
    render(<DialogDemo />)
    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    const dialog = screen.getByRole('dialog')
    // 브라우저는 Esc 를 누르면 cancel 이벤트 뒤에 대화상자를 닫는다.
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(true)
    act(() => {
      ;(dialog as HTMLDialogElement).close()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('어두운 바깥 영역을 누르면 닫힌다', async () => {
    render(<DialogDemo />)
    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AlertDialog', () => {
  it('role=alertdialog 이고 안전한 "취소"에 처음 초점이 놓인다', async () => {
    render(<DialogDemo alert />)
    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    const dialog = screen.getByRole('alertdialog', { name: '삭제할까요?' })
    expect(dialog).toHaveAccessibleDescription('되돌릴 수 없습니다.')
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
  })

  it('바깥을 눌러도 닫히지 않고, 취소·확인으로만 끝난다', async () => {
    render(<DialogDemo alert />)
    await userEvent.click(screen.getByRole('button', { name: '열기' }))
    fireEvent.click(screen.getByRole('alertdialog'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('삭제됨')).toBeInTheDocument()
  })

  it('처리 중에는 Esc 로도 닫히지 않는다', () => {
    render(
      <AlertDialog
        open
        onOpenChange={() => undefined}
        title="삭제할까요?"
        description="설명"
        confirmLabel="삭제"
        onConfirm={() => undefined}
        loading
      />,
    )
    const dialog = screen.getByRole('alertdialog')
    // 취소할 수 없는 cancel 이벤트: preventDefault 가 불리면 fireEvent 는 false 를 돌려준다.
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false)
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
  })
})

describe('Sheet', () => {
  it('가장자리 패널도 대화상자 규칙(이름·닫기)을 그대로 따른다', async () => {
    const onOpenChange = vi.fn()
    render(<Sheet open onOpenChange={onOpenChange} title="필터" side="bottom" />)
    expect(screen.getByRole('dialog', { name: '필터' })).toHaveClass('bottom-0')
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Tabs', () => {
  it('←/→ 키로 탭을 옮기고 내용이 바뀐다', async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="상태">
          <TabsTrigger value="a">진행 중</TabsTrigger>
          <TabsTrigger value="b">종료됨</TabsTrigger>
        </TabsList>
        <TabsContent value="a">진행 내용</TabsContent>
        <TabsContent value="b">종료 내용</TabsContent>
      </Tabs>,
    )
    const first = screen.getByRole('tab', { name: '진행 중' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    act(() => {
      first.focus()
    })
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '종료됨' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('종료 내용')
  })
})

describe('Tooltip', () => {
  it('키보드 초점만으로도 설명이 나타난다', async () => {
    render(
      <Tooltip content="센서를 추가합니다">
        <IconButton icon={Plus} label="추가" />
      </Tooltip>,
    )
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('센서를 추가합니다')
  })
})

function ToastDemo({ tone }: { tone: 'ok' | 'danger' }) {
  const { toast } = useToast()
  return (
    <button
      type="button"
      onClick={() => {
        toast({ tone, title: '결과 안내', description: '자세한 설명' })
      }}
    >
      띄우기
    </button>
  )
}

describe('Toast', () => {
  it('안내를 띄우고 직접 닫을 수 있다', async () => {
    render(
      <ToastProvider>
        <ToastDemo tone="danger" />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: '띄우기' }))
    expect((await screen.findAllByText('결과 안내')).length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: /안내 메시지/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '안내 닫기' }))
    expect(screen.queryByRole('button', { name: '안내 닫기' })).not.toBeInTheDocument()
  })

  it('ToastProvider 밖에서 useToast 를 쓰면 이유를 알려 준다', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<ToastDemo tone="ok" />)).toThrow('ToastProvider')
    error.mockRestore()
  })
})

describe('상태 화면', () => {
  it('EmptyState 는 안내와 다음 행동을 보여 준다', () => {
    render(
      <EmptyState
        title="알림이 없습니다"
        description="아직 없어요."
        action={<button type="button">등록</button>}
      />,
    )
    expect(screen.getByText('알림이 없습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })

  it('ErrorState 는 role=alert 로 원인을 글자로 말하고 다시 시도할 수 있다', async () => {
    const onRetry = vi.fn()
    render(
      <ErrorState
        message="서버에 연결할 수 없습니다."
        detail="요청 번호 r1"
        onRetry={onRetry}
        variant="panel"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했습니다')
    expect(screen.getByText('서버에 연결할 수 없습니다.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('Skeleton 은 스크린리더에서 숨겨진다', () => {
    const { container } = render(
      <>
        <Skeleton />
        <SkeletonText lines={3} />
      </>,
    )
    for (const el of container.querySelectorAll('span, div')) {
      expect(el.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })
})
