import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { ReactElement, ReactNode } from 'react'

interface TooltipProps {
  /** 짧은 보충 설명. 꼭 알아야 하는 정보는 여기에만 두지 않는다. (터치 화면에는 마우스 올리기가 없다) */
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** 초점을 받을 수 있는 요소 하나(버튼·링크). 키보드 초점에서도 나타난다. */
  children: ReactElement
}

/** 아이콘 버튼처럼 글자가 없는 요소의 이름을 눈으로도 보여 주는 말풍선 */
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-xs rounded-control bg-ink px-3 py-2 text-body-sm text-ink-inverse shadow-overlay"
          >
            {content}
            <RadixTooltip.Arrow className="fill-ink" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
