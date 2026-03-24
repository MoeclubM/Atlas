import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-sm border text-sm font-semibold focus-visible:outline focus-visible:outline-1 focus-visible:outline-slate-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950',
        secondary:
          'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50',
        ghost:
          'border-transparent bg-transparent text-slate-700 dark:text-slate-200',
        danger: 'border-rose-700 bg-rose-700 text-white dark:border-rose-500 dark:bg-rose-500 dark:text-slate-950',
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
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
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
