import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: 'dialog' | 'alertdialog'
  labelledBy: string
  describedBy?: string
  /** 바깥(어두운 영역)을 눌러 닫을 수 있는지 */
  dismissOnBackdrop?: boolean
  /** false 면 Esc·바깥 누르기로도 닫히지 않는다. (처리 중에 실수로 닫히지 않게) */
  dismissible?: boolean
  className?: string
  children: ReactNode
}

/**
 * Dialog·AlertDialog·Sheet 의 바탕. 브라우저 기본 <dialog> 의 모달 기능을 쓴다.
 *  - 초점이 대화상자 안에 갇히고, 닫으면 열기 전 위치로 돌아간다.
 *  - 뒤 화면은 조작·읽기에서 제외된다(inert). Esc 로 닫힌다.
 * Radix Dialog 대신 이것을 쓰는 이유: Radix Dialog 의 스크롤 잠금(react-remove-scroll)은 <style> 태그를 끼워 넣는 것으로
 * 알려져 있어 우리의 CSP(style-src 'self')와 충돌할 위험이 있다. (직접 확인하지는 않았다)
 * 브라우저 기본 기능만으로 같은 동작을 얻으면 이 위험이 처음부터 없다.
 */
export function Modal({
  open,
  onOpenChange,
  role = 'dialog',
  labelledBy,
  describedBy,
  dismissOnBackdrop = true,
  dismissible = true,
  className,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  const dismissibleRef = useRef(dismissible)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    dialog.showModal()
    // 가장 안전한 선택(예: "취소")에 처음 초점을 둔다.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    const handleClose = () => {
      // 개발 모드에서 효과가 다시 실행되는 사이의 닫힘은 무시한다. (이미 다시 열려 있다)
      if (!dialog.open) onOpenChangeRef.current(false)
    }
    const handleCancel = (event: Event) => {
      if (!dismissibleRef.current) event.preventDefault()
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
      if (dialog.open) dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // 대화상자 상자(padding 0) 자체가 눌렸다면 어두운 영역을 누른 것이다.
      onClick={(event) => {
        if (dismissOnBackdrop && dismissible && event.target === event.currentTarget) {
          onOpenChange(false)
        }
      }}
      className={cn('bg-surface p-0 text-ink shadow-overlay backdrop:bg-overlay', className)}
    >
      {open ? children : null}
    </dialog>
  )
}
