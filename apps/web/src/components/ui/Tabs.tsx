import * as RadixTabs from '@radix-ui/react-tabs'
import { createContext, useContext, type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

type TabsVariant = 'underline' | 'pill'
type TabsSize = 'md' | 'lg'

interface TabsStyle {
  variant: TabsVariant
  size: TabsSize
}

const TabsStyleContext = createContext<TabsStyle>({ variant: 'underline', size: 'md' })

interface TabsProps extends ComponentProps<typeof RadixTabs.Root> {
  variant?: TabsVariant
  size?: TabsSize
}

/**
 * 같은 화면 안에서 내용을 바꿔 보여 주는 탭. (화면 이동이면 탭이 아니라 링크 메뉴를 쓴다)
 * ←/→ 로 탭 사이를 옮기고, Home/End 로 처음·끝으로 간다. 선택 상태는 색뿐 아니라 밑줄·채움 모양으로도 보인다.
 */
export function Tabs({ variant = 'underline', size = 'md', ...rest }: TabsProps) {
  return (
    <TabsStyleContext.Provider value={{ variant, size }}>
      <RadixTabs.Root {...rest} />
    </TabsStyleContext.Provider>
  )
}

export function TabsList({ className, ...rest }: ComponentProps<typeof RadixTabs.List>) {
  const { variant } = useContext(TabsStyleContext)
  return (
    <RadixTabs.List
      className={cn(
        'flex gap-1 overflow-x-auto',
        variant === 'underline' ? 'border-b border-line' : 'rounded-card bg-status-muted-soft p-1',
        className,
      )}
      {...rest}
    />
  )
}

const TRIGGER_VARIANTS: Record<TabsVariant, string> = {
  underline:
    '-mb-px border-b-4 border-transparent text-ink-muted hover:text-ink data-[state=active]:border-brand data-[state=active]:text-brand-strong',
  // 알약 탭의 회색 바탕 위에서는 ink-muted 가 대비 4.5:1 에 못 미치므로 기본 글자색을 쓴다.
  pill: 'rounded-control text-ink hover:text-brand-strong data-[state=active]:bg-surface data-[state=active]:text-brand-strong data-[state=active]:shadow-overlay',
}

const TRIGGER_SIZES: Record<TabsSize, string> = {
  md: 'min-h-12 px-4 text-body',
  lg: 'min-h-14 px-5 text-body-lg',
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof RadixTabs.Trigger>) {
  const { variant, size } = useContext(TabsStyleContext)
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        TRIGGER_VARIANTS[variant],
        TRIGGER_SIZES[size],
        className,
      )}
      {...rest}
    />
  )
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('pt-4', className)} {...rest} />
}
