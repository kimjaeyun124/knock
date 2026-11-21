import { X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Modal } from './Modal'

type DialogSize = 'sm' | 'md' | 'lg'

const SIZES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

const FRAME =
  'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-card border border-line'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  /** 본문 아래의 버튼 줄 */
  footer?: ReactNode
  size?: DialogSize
  children?: ReactNode
}

/** 화면 위에 뜨는 대화상자. 하던 일을 잠시 멈추고 무언가를 입력·확인하게 할 때 쓴다. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'md',
  children,
}: DialogProps) {
  const id = useId()
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={`${id}-title`}
      describedBy={description ? `${id}-description` : undefined}
      className={`${FRAME} ${SIZES[size]}`}
    >
      <div className="space-y-4 p-6">
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
        {children}
        {footer ? <div className="flex flex-wrap justify-end gap-3 pt-2">{footer}</div> : null}
      </div>
    </Modal>
  )
}

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** 무엇이 일어나는지, 되돌릴 수 있는지를 사실대로 적는다. */
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** danger: 삭제처럼 되돌리기 어려운 동작 */
  tone?: 'default' | 'danger'
  onConfirm: () => void
  /** 확인 동작을 처리 중. 이때는 닫히지 않는다. */
  loading?: boolean
}

/**
 * 되돌리기 어려운 동작을 한 번 더 확인하는 대화상자. (role="alertdialog")
 * 바깥을 눌러도 닫히지 않으며, 처음 초점은 안전한 "취소"에 놓인다.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = '취소',
  tone = 'default',
  onConfirm,
  loading = false,
}: AlertDialogProps) {
  const id = useId()
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      dismissOnBackdrop={false}
      dismissible={!loading}
      className={`${FRAME} ${SIZES.sm}`}
    >
      <div className="space-y-4 p-6">
        <h2 id={`${id}-title`} className="text-h2">
          {title}
        </h2>
        <p id={`${id}-description`} className="text-body text-ink">
          {description}
        </p>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            data-autofocus
            disabled={loading}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
