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
        'inline-flex h-11 w-full flex-wrap items-center gap-1 rounded-sm border border-stone-300 bg-[var(--surface)] p-1 dark:border-stone-700 dark:bg-[var(--surface)]',
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
        'inline-flex h-9 items-center justify-center rounded-sm px-4 text-sm font-medium text-stone-600 outline-none transition-colors data-[state=active]:bg-stone-900 data-[state=active]:text-stone-50 dark:text-stone-300 dark:data-[state=active]:bg-stone-100 dark:data-[state=active]:text-stone-950',
        className
      )}
      {...props}
    />
  )
}

export const TabsContent = TabsPrimitive.Content
