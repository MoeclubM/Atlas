import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-sm border text-sm font-medium focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]',
        secondary:
          'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]',
        ghost:
          'border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
        danger:
          'border-rose-700 bg-rose-700 text-white hover:bg-rose-800 dark:border-rose-500 dark:bg-rose-500 dark:text-stone-950 dark:hover:bg-rose-400',
      },
      size: {
        sm: 'h-9 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
})
