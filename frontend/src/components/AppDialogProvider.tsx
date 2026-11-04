import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react'
import './AppDialogProvider.css'

type DialogTone = 'danger' | 'warning' | 'success' | 'info'
type DialogKind = 'confirm' | 'alert' | 'prompt'

interface BaseDialogOptions {
  title: string
  message: string
  tone?: DialogTone
}

export interface ConfirmDialogOptions extends BaseDialogOptions {
  confirmLabel?: string
  cancelLabel?: string
}

export interface AlertDialogOptions extends BaseDialogOptions {
  confirmLabel?: string
}

export interface PromptDialogOptions extends BaseDialogOptions {
  inputLabel?: string
  placeholder?: string
  defaultValue?: string
  inputType?: 'text' | 'password'
  confirmLabel?: string
  cancelLabel?: string
}

type DialogInput =
  | (ConfirmDialogOptions & { kind: 'confirm' })
  | (AlertDialogOptions & { kind: 'alert' })
  | (PromptDialogOptions & { kind: 'prompt'; value: string })

type DialogState =
  | (ConfirmDialogOptions & { id: number; kind: 'confirm' })
  | (AlertDialogOptions & { id: number; kind: 'alert' })
  | (PromptDialogOptions & { id: number; kind: 'prompt'; value: string })

interface AppDialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
  alert: (options: AlertDialogOptions | string) => Promise<void>
  prompt: (options: PromptDialogOptions) => Promise<string | null>
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null)

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const resolverRef = useRef<((value: unknown) => void) | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)

  const finish = useCallback((value: unknown) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    resolve?.(value)
  }, [])

  const open = useCallback(<T,>(next: DialogInput): Promise<T> => {
    return new Promise<T>((resolve) => {
      resolverRef.current = (value) => resolve(value as T)
      idRef.current += 1
      setDialog({ ...next, id: idRef.current } as DialogState)
    })
  }, [])

  const confirm = useCallback(
    (options: ConfirmDialogOptions) => open<boolean>({ ...options, kind: 'confirm' }),
    [open],
  )

  const alert = useCallback(
    (options: AlertDialogOptions | string) => {
      const normalized = typeof options === 'string'
        ? { title: 'Notice', message: options, tone: 'info' as const }
        : options
      return open<void>({ ...normalized, kind: 'alert' })
    },
    [open],
  )

  const prompt = useCallback(
    (options: PromptDialogOptions) =>
      open<string | null>({ ...options, kind: 'prompt', value: options.defaultValue ?? '' }),
    [open],
  )

  const contextValue = useMemo(
    () => ({ confirm, alert, prompt }),
    [confirm, alert, prompt],
  )

  const dialogId = dialog?.id
  const dialogKind = dialog?.kind
  useEffect(() => {
    if (!dialogId) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFrame = window.requestAnimationFrame(() => {
      if (dialogKind === 'prompt') {
        inputRef.current?.focus()
      } else {
        const cancelButton = dialogRef.current?.querySelector<HTMLElement>('.vp-dialog-cancel')
        const primaryButton = dialogRef.current?.querySelector<HTMLElement>('.vp-dialog-primary')
        ;(cancelButton ?? primaryButton)?.focus()
      }
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(dialogKind === 'confirm' ? false : dialogKind === 'prompt' ? null : undefined)
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      window.requestAnimationFrame(() => previouslyFocused?.focus?.())
    }
  }, [dialogId, dialogKind, finish])

  const updatePromptValue = (value: string) => {
    setDialog((current) => current?.kind === 'prompt' ? { ...current, value } : current)
  }

  const closeFromBackdrop = () => {
    if (dialog?.kind === 'confirm') finish(false)
    else if (dialog?.kind === 'prompt') finish(null)
    else finish(undefined)
  }

  const Icon = dialog?.tone === 'danger'
    ? ShieldAlert
    : dialog?.tone === 'warning'
      ? AlertTriangle
      : dialog?.tone === 'success'
        ? CheckCircle2
        : dialog?.kind === 'alert'
          ? AlertCircle
          : Info

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {dialog && createPortal(
        <div className="vp-dialog-backdrop" onMouseDown={closeFromBackdrop}>
          <section
            ref={dialogRef}
            className={`vp-dialog vp-dialog-${dialog.tone ?? 'info'}`}
            role={dialog.kind === 'prompt' ? 'dialog' : 'alertdialog'}
            aria-modal="true"
            aria-labelledby="vp-dialog-title"
            aria-describedby="vp-dialog-message"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="vp-dialog-close"
              type="button"
              aria-label="Close dialog"
              onClick={closeFromBackdrop}
            >
              <X size={17} />
            </button>

            <div className="vp-dialog-icon" aria-hidden="true">
              <Icon size={24} strokeWidth={1.9} />
            </div>
            <div className="vp-dialog-copy">
              <h2 id="vp-dialog-title">{dialog.title}</h2>
              <p id="vp-dialog-message">{dialog.message}</p>
            </div>

            {dialog.kind === 'prompt' && (
              <label className="vp-dialog-input-wrap">
                <span>{dialog.inputLabel ?? 'Value'}</span>
                <input
                  ref={inputRef}
                  type={dialog.inputType ?? 'text'}
                  value={dialog.value}
                  placeholder={dialog.placeholder}
                  onChange={(event) => updatePromptValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      finish(dialog.value)
                    }
                  }}
                />
              </label>
            )}

            <div className="vp-dialog-actions">
              {dialog.kind !== 'alert' && (
                <button
                  type="button"
                  className="vp-dialog-button vp-dialog-cancel"
                  onClick={() => finish(dialog.kind === 'confirm' ? false : null)}
                >
                  {dialog.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                type="button"
                className={`vp-dialog-button vp-dialog-primary${dialog.tone === 'danger' ? ' is-danger' : ''}`}
                onClick={() => finish(dialog.kind === 'confirm' ? true : dialog.kind === 'prompt' ? dialog.value : undefined)}
              >
                {dialog.confirmLabel ?? (dialog.kind === 'confirm' ? 'Confirm' : dialog.kind === 'prompt' ? 'Save' : 'Got it')}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </AppDialogContext.Provider>
  )
}

export function useAppDialog() {
  const context = useContext(AppDialogContext)
  if (!context) throw new Error('useAppDialog must be used within AppDialogProvider')
  return context
}
