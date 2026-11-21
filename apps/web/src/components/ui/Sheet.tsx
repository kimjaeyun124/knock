import { X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { IconButton } from './IconButton'
import { Modal } from './Modal'

type SheetSide = 'right' | 'left' | 'bottom'

/** 화면 가장자리에 붙는 패널. 좁은 화면에서는 bottom(아래에서 올라옴)이 손이 닿기 쉽다. */
const SIDES: Record<SheetSide, string> = {
  right:
    'fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md rounded-none border-l border-line',
  left: 'fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-full max-w-md rounded-none border-r border-line',
  bottom:
    'fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none rounded-t-card border-t border-line',
}

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  side?: SheetSide
  footer?: ReactNode
  children?: ReactNode
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  footer,
  children,
}: SheetProps) {
  const id = useId()
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={`${id}-title`}
      describedBy={description ? `${id}-description` : undefined}
      className={`${SIDES[side]} overflow-y-auto`}
    >
      <div className="flex min-h-full flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-h2">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-description`} className="mt-1 text-body text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            icon={X}
            label="닫기"
            size="sm"
            className="-mt-2 -mr-2"
            onClick={() => {
              onOpenChange(false)
            }}
          />
        </div>
        <div className="flex-1">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </div>
    </Modal>
  )
}
