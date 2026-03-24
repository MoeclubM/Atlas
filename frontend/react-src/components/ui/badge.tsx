import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:
          'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        warning:
          'border-[#e8c89f] bg-[#fbf1e2] text-[#996230] dark:border-[#8a5f37] dark:bg-[#3a2c21] dark:text-[#ddb587]',
        danger:
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
        info: 'border-[var(--border-strong)] bg-[var(--accent-weak)] text-[var(--accent)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
