import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export type SelectOption = {
  value: string
  label: string
  testId?: string
}

export function SelectField({
  value,
  onValueChange,
  options,
  className,
  placeholder,
  testId,
}: {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  className?: string
  placeholder?: string
  testId?: string
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange}>
      <RadixSelect.Trigger
        className={cn(
          'inline-flex h-10 w-full items-center justify-between rounded-sm border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus-visible:outline focus-visible:outline-1 focus-visible:outline-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100',
          className,
        )}
        data-testid={testId}
      >
        <RadixSelect.Value placeholder={placeholder}>{selected?.label}</RadixSelect.Value>
        <RadixSelect.Icon>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={8}
          className="z-[70] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-sm border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950"
        >
          <RadixSelect.Viewport className="p-1.5">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                data-testid={option.testId}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-8 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-900"
              >
                <RadixSelect.ItemIndicator className="absolute left-2">
                  <Check className="h-4 w-4" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
