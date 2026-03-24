import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
      success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
      warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
      danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300',
      info: 'bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
