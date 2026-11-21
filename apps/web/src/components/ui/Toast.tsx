import * as RadixToast from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import { IconButton } from './IconButton'
import { TONE_STYLES, type StatusTone } from './tones'

export interface ToastOptions {
  tone?: StatusTone
  title: string
  description?: string
  /** 밀리초. 생략하면 상태에 맞춰 정한다. 위험(danger)은 직접 닫을 때까지 남는다. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
  tone: StatusTone
}

interface ToastApi {
  toast: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION: Record<StatusTone, number> = {
  ok: 5000,
  checking: 5000,
  muted: 6000,
  warn: 8000,
  // 읽기 전에 사라지면 안 되는 내용이다. 마우스·키보드로 닫을 때까지 둔다.
  danger: Infinity,
}

/**
 * 짧은 결과 안내(저장했습니다 등). 앱 맨 위에 한 번만 둔다.
 *  - 위험·주의는 스크린리더가 즉시 읽고(assertive), 나머지는 하던 말이 끝난 뒤 읽는다(polite).
 *  - 마우스를 올리거나 초점이 있는 동안에는 사라지지 않는다.
 * 긴급 알림처럼 놓치면 안 되는 내용은 토스트가 아니라 화면에 남는 배너·목록으로 알린다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    setItems((current) => [...current, { ...options, id, tone: options.tone ?? 'muted' }])
    return id
  }, [])

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {items.map((item) => {
          const style = TONE_STYLES[item.tone]
          const Icon = style.icon
          return (
            <RadixToast.Root
              key={item.id}
              type={item.tone === 'danger' || item.tone === 'warn' ? 'foreground' : 'background'}
              duration={item.duration ?? DEFAULT_DURATION[item.tone]}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id)
              }}
              className={cn(
                'flex items-start gap-3 rounded-card border-2 bg-surface p-4 shadow-overlay',
                style.border,
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn('mt-0.5 size-6 shrink-0', style.fill, style.spin && 'animate-spin')}
              />
              <div className="min-w-0 flex-1">
                <RadixToast.Title className="text-body font-bold">{item.title}</RadixToast.Title>
                {item.description ? (
                  <RadixToast.Description className="mt-1 text-body-sm text-ink-muted">
                    {item.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              <RadixToast.Close asChild>
                <IconButton icon={X} label="안내 닫기" size="sm" className="-mt-2 -mr-2" />
              </RadixToast.Close>
            </RadixToast.Root>
          )
        })}
        <RadixToast.Viewport
          label="안내 메시지 ({hotkey})"
          className="fixed inset-x-4 bottom-20 z-50 flex flex-col gap-3 outline-none md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

/** 토스트를 띄운다. ToastProvider 안에서만 쓸 수 있다. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast 는 ToastProvider 안에서만 쓸 수 있습니다.')
  return api
}
