import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('mb-2 block text-sm font-medium text-[var(--text-2)]', className)} {...props} />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
          className
        )}
        {...props}
      />
    )
  }
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[120px] w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
        className
      )}
      {...props}
    />
  )
})
