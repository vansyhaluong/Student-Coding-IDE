import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'

import { Button } from './Button'

const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface DialogProps {
  title: string
  description?: string
  children?: ReactNode
  actions: ReactNode
  onCancel(): void
  initialFocus?: 'dialog' | 'first-input' | 'primary'
  label?: string
}

export function Dialog({
  title,
  description,
  children,
  actions,
  onCancel,
  initialFocus = 'primary',
  label,
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const dialog = dialogRef.current
    if (!dialog) return
    const preferred = initialFocus === 'first-input'
      ? dialog.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')
      : initialFocus === 'primary'
        ? dialog.querySelector<HTMLElement>('[data-dialog-primary="true"]')
        : dialog
    ;(preferred ?? dialog).focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [initialFocus, onCancel])

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={label ? undefined : titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <Button
            className="dialog-close"
            variant="ghost"
            size="iconSmall"
            onClick={onCancel}
            aria-label="Close dialog"
          >
            <X />
          </Button>
        </div>
        {description && <p id={descriptionId} className="dialog-description">{description}</p>}
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}

interface PromptDialogProps {
  title: string
  description?: string
  label: string
  initialValue?: string
  submitLabel: string
  submitDisabled?: boolean
  onSubmit(value: string): void
  onCancel(): void
}

export function PromptDialog({
  title,
  description,
  label,
  initialValue = '',
  submitLabel,
  submitDisabled = false,
  onSubmit,
  onCancel,
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (submitDisabled) return
    const value = inputRef.current?.value.trim() ?? ''
    if (value) onSubmit(value)
  }
  return (
    <form onSubmit={submit}>
      <Dialog
        title={title}
        description={description}
        onCancel={onCancel}
        initialFocus="first-input"
        actions={(
          <>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              data-dialog-primary="true"
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          </>
        )}
      >
        <label className="dialog-field">
          <span>{label}</span>
          <input ref={inputRef} defaultValue={initialValue} maxLength={255} autoComplete="off" />
        </label>
      </Dialog>
    </form>
  )
}
