import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-2 block text-sm font-medium text-stone-700 dark:text-stone-200', className)}
      {...props}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-sm border border-stone-300 bg-[var(--surface)] px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-stone-400 dark:border-stone-700 dark:bg-[var(--surface)] dark:text-stone-100',
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
        'min-h-[120px] w-full rounded-sm border border-stone-300 bg-[var(--surface)] px-3 py-2 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-stone-400 dark:border-stone-700 dark:bg-[var(--surface)] dark:text-stone-100',
        className
      )}
      {...props}
    />
  )
})
