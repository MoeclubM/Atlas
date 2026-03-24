import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  testId,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
  testId?: string
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={value => onCheckedChange(value === true)}
      data-testid={testId}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
        className
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
