import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/cn'

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-11 w-full flex-wrap items-center gap-1 rounded-sm border border-[var(--border)] bg-[var(--surface)] p-1',
        className
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-sm px-4 text-sm font-medium text-[var(--text-2)] outline-none transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] data-[state=active]:bg-[var(--surface-2)] data-[state=active]:text-[var(--accent)]',
        className
      )}
      {...props}
    />
  )
}

export const TabsContent = TabsPrimitive.Content
